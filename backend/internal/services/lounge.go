package services

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/songify/backend/internal/db"
)

const (
	loungeBaseURL           = "https://www.youtube.com/api/lounge"
	loungeInactivityTimeout = 30 * time.Minute
	loungeMaxRetries        = 3
	loungeRetryBaseDelay    = 2 * time.Second
)

// LoungeStatus represents the connection state of a Lounge session.
type LoungeStatus string

const (
	LoungeStatusConnected    LoungeStatus = "connected"
	LoungeStatusDisconnected LoungeStatus = "disconnected"
	LoungeStatusConnecting   LoungeStatus = "connecting"
	LoungeStatusError        LoungeStatus = "error"
)

// LoungeManager manages YouTube Lounge connections across sessions.
// It maps sessionID -> loungeSession and is safe for concurrent use.
// Credentials (screenID, loungeToken, screenName) are persisted to the database
// so they survive backend restarts.
type LoungeManager struct {
	mu       sync.Mutex
	sessions map[string]*loungeSession
	queries  *db.Queries
}

// loungeSession holds per-connection state for a YouTube TV pairing.
type loungeSession struct {
	screenID    string
	loungeToken string
	screenName  string

	sid        string
	gsessionID string

	rid int
	aid int
	ofs int

	status       LoungeStatus
	errorMsg     string
	lastActivity time.Time

	cancel     context.CancelFunc
	httpClient *http.Client
}

// NewLoungeManager creates a new LoungeManager.
func NewLoungeManager(queries *db.Queries) *LoungeManager {
	return &LoungeManager{
		sessions: make(map[string]*loungeSession),
		queries:  queries,
	}
}

// Pair validates a pairing code, binds to the TV, and starts a long-poll goroutine.
func (m *LoungeManager) Pair(ctx context.Context, sessionID, pairingCode string) error {
	slog.Info("lounge: pairing started", slog.String("session_id", sessionID))

	m.mu.Lock()
	// Disconnect existing session if any
	if existing, ok := m.sessions[sessionID]; ok {
		slog.Info("lounge: disconnecting existing session before re-pair", slog.String("session_id", sessionID))
		existing.disconnect()
		delete(m.sessions, sessionID)
	}

	ls := &loungeSession{
		status:       LoungeStatusConnecting,
		lastActivity: time.Now(),
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
	m.sessions[sessionID] = ls
	m.mu.Unlock()

	// Step 1: Get screen info from pairing code
	if err := ls.getScreen(ctx, pairingCode); err != nil {
		slog.Error("lounge: getScreen failed", slog.String("session_id", sessionID), slog.String("error", err.Error()))
		m.mu.Lock()
		ls.status = LoungeStatusError
		ls.errorMsg = err.Error()
		m.mu.Unlock()
		return fmt.Errorf("pairing failed: %w", err)
	}
	slog.Info("lounge: getScreen succeeded", slog.String("session_id", sessionID), slog.String("screen_name", ls.screenName), slog.String("screen_id", ls.screenID))

	// Persist credentials to DB so they survive restarts
	if err := m.queries.SaveLoungeCredentials(ctx, db.SaveLoungeCredentialsParams{
		LoungeScreenID:   sql.NullString{String: ls.screenID, Valid: true},
		LoungeToken:      sql.NullString{String: ls.loungeToken, Valid: true},
		LoungeScreenName: sql.NullString{String: ls.screenName, Valid: ls.screenName != ""},
		ID:               sessionID,
	}); err != nil {
		slog.Error("lounge: failed to persist credentials", slog.String("session_id", sessionID), slog.String("error", err.Error()))
	}

	// Step 2: Bind to get SID/gsessionid
	if err := ls.bind(ctx); err != nil {
		slog.Error("lounge: bind failed", slog.String("session_id", sessionID), slog.String("error", err.Error()))
		m.mu.Lock()
		ls.status = LoungeStatusError
		ls.errorMsg = err.Error()
		m.mu.Unlock()
		return fmt.Errorf("bind failed: %w", err)
	}
	slog.Info("lounge: bind succeeded", slog.String("session_id", sessionID), slog.String("sid", ls.sid), slog.String("gsessionid", ls.gsessionID))

	m.mu.Lock()
	ls.status = LoungeStatusConnected
	ls.lastActivity = time.Now()
	m.mu.Unlock()

	// Step 3: Start long-poll goroutine
	pollCtx, cancel := context.WithCancel(context.Background())
	ls.cancel = cancel
	go m.longPollLoop(pollCtx, sessionID, ls)

	slog.Info("lounge: paired successfully", slog.String("session_id", sessionID), slog.String("screen_name", ls.screenName))
	return nil
}

// Disconnect explicitly disconnects from a TV and removes all session state,
// including persisted credentials.
func (m *LoungeManager) Disconnect(sessionID string) {
	m.mu.Lock()
	if ls, ok := m.sessions[sessionID]; ok {
		slog.Info("lounge: disconnecting", slog.String("session_id", sessionID), slog.String("screen_name", ls.screenName))
		ls.disconnect()
		delete(m.sessions, sessionID)
	} else {
		slog.Info("lounge: disconnect called but no active session", slog.String("session_id", sessionID))
	}
	m.mu.Unlock()

	// Clear persisted credentials
	if err := m.queries.ClearLoungeCredentials(context.Background(), sessionID); err != nil {
		slog.Error("lounge: failed to clear persisted credentials", slog.String("session_id", sessionID), slog.String("error", err.Error()))
	}
}

// Reconnect re-binds to the TV using existing credentials (screenID/loungeToken)
// and restarts the long-poll goroutine. Does not require a new pairing code.
// If credentials aren't in memory, loads them from the database.
func (m *LoungeManager) Reconnect(ctx context.Context, sessionID string) error {
	m.mu.Lock()
	ls, ok := m.sessions[sessionID]
	if !ok || ls.screenID == "" || ls.loungeToken == "" {
		// Try loading from DB
		m.mu.Unlock()
		creds, err := m.queries.GetLoungeCredentials(ctx, sessionID)
		if err != nil || !creds.LoungeScreenID.Valid || !creds.LoungeToken.Valid {
			return fmt.Errorf("no existing credentials to reconnect with")
		}

		m.mu.Lock()
		ls = &loungeSession{
			screenID:     creds.LoungeScreenID.String,
			loungeToken:  creds.LoungeToken.String,
			screenName:   creds.LoungeScreenName.String,
			lastActivity: time.Now(),
			httpClient:   &http.Client{Timeout: 30 * time.Second},
		}
		m.sessions[sessionID] = ls
		slog.Info("lounge: loaded credentials from DB", slog.String("session_id", sessionID), slog.String("screen_name", ls.screenName))
	}

	// Cancel any existing poll goroutine
	if ls.cancel != nil {
		ls.cancel()
	}

	// Reset session state for re-bind
	ls.status = LoungeStatusConnecting
	ls.errorMsg = ""
	ls.sid = ""
	ls.gsessionID = ""
	ls.aid = 0
	ls.ofs = 0
	ls.lastActivity = time.Now()
	m.mu.Unlock()

	slog.Info("lounge: reconnecting", slog.String("session_id", sessionID), slog.String("screen_name", ls.screenName))

	if err := ls.bind(ctx); err != nil {
		m.mu.Lock()
		ls.status = LoungeStatusError
		ls.errorMsg = err.Error()
		m.mu.Unlock()
		slog.Error("lounge: reconnect bind failed", slog.String("session_id", sessionID), slog.String("error", err.Error()))
		return fmt.Errorf("reconnect failed: %w", err)
	}
	slog.Info("lounge: reconnect bind succeeded", slog.String("session_id", sessionID), slog.String("sid", ls.sid), slog.String("gsessionid", ls.gsessionID))

	m.mu.Lock()
	ls.status = LoungeStatusConnected
	ls.lastActivity = time.Now()
	m.mu.Unlock()

	pollCtx, cancel := context.WithCancel(context.Background())
	ls.cancel = cancel
	go m.longPollLoop(pollCtx, sessionID, ls)

	slog.Info("lounge: reconnected successfully", slog.String("session_id", sessionID))
	return nil
}

// Status returns the current connection status for a session.
// If no in-memory session exists but DB has saved credentials, returns "error"
// status so the frontend can offer a reconnect option.
func (m *LoungeManager) Status(sessionID string) (LoungeStatus, string, string) {
	m.mu.Lock()
	ls, ok := m.sessions[sessionID]
	m.mu.Unlock()

	if ok {
		return ls.status, ls.screenName, ls.errorMsg
	}

	// Check DB for persisted credentials
	creds, err := m.queries.GetLoungeCredentials(context.Background(), sessionID)
	if err == nil && creds.LoungeScreenID.Valid && creds.LoungeToken.Valid {
		return LoungeStatusError, creds.LoungeScreenName.String, "TV connection lost (server restarted)"
	}

	return LoungeStatusDisconnected, "", ""
}

// SendAddVideo sends an addVideo command to append a video to the TV queue.
// Returns nil if no Lounge is connected for this session.
func (m *LoungeManager) SendAddVideo(sessionID, videoID string) error {
	m.mu.Lock()
	ls, ok := m.sessions[sessionID]
	if !ok || ls.status != LoungeStatusConnected {
		m.mu.Unlock()
		slog.Info("lounge: SendAddVideo skipped, not connected", slog.String("session_id", sessionID), slog.String("video_id", videoID))
		return nil
	}
	m.mu.Unlock()

	slog.Info("lounge: sending addVideo", slog.String("session_id", sessionID), slog.String("video_id", videoID))
	if err := ls.sendCommand("addVideo", videoID, nil); err != nil {
		slog.Error("lounge: addVideo failed", slog.String("session_id", sessionID), slog.String("video_id", videoID), slog.String("error", err.Error()))
		return err
	}
	slog.Info("lounge: addVideo succeeded", slog.String("session_id", sessionID), slog.String("video_id", videoID))
	return nil
}

// SendSetVideo sends a setVideo command to play a video immediately on the TV.
// Returns nil if no Lounge is connected for this session.
func (m *LoungeManager) SendSetVideo(sessionID, videoID string) error {
	m.mu.Lock()
	ls, ok := m.sessions[sessionID]
	if !ok || ls.status != LoungeStatusConnected {
		m.mu.Unlock()
		slog.Info("lounge: SendSetVideo skipped, not connected", slog.String("session_id", sessionID), slog.String("video_id", videoID))
		return nil
	}
	m.mu.Unlock()

	slog.Info("lounge: sending setVideo", slog.String("session_id", sessionID), slog.String("video_id", videoID))
	if err := ls.sendCommand("setVideo", videoID, map[string]string{
		"currentTime": "0",
	}); err != nil {
		slog.Error("lounge: setVideo failed", slog.String("session_id", sessionID), slog.String("video_id", videoID), slog.String("error", err.Error()))
		return err
	}
	slog.Info("lounge: setVideo succeeded", slog.String("session_id", sessionID), slog.String("video_id", videoID))
	return nil
}

// IsConnected returns whether a Lounge session is currently connected.
func (m *LoungeManager) IsConnected(sessionID string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	ls, ok := m.sessions[sessionID]
	return ok && ls.status == LoungeStatusConnected
}

// getScreen calls the pairing endpoint to get screenID, loungeToken, and screenName.
func (ls *loungeSession) getScreen(ctx context.Context, pairingCode string) error {
	pairingURL := fmt.Sprintf("%s/pairing/get_screen?pairing_code=%s", loungeBaseURL, url.QueryEscape(pairingCode))

	req, err := http.NewRequestWithContext(ctx, "GET", pairingURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create pairing request: %w", err)
	}

	resp, err := ls.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("pairing request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read pairing response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("pairing failed with status %d: %s", resp.StatusCode, string(body))
	}

	screenID, loungeToken, screenName, err := parsePairingResponse(body)
	if err != nil {
		return err
	}

	ls.screenID = screenID
	ls.loungeToken = loungeToken
	ls.screenName = screenName
	return nil
}

// bind performs the initial bind request to get SID and gsessionid.
func (ls *loungeSession) bind(ctx context.Context) error {
	ls.rid++

	params := url.Values{
		"device":        {"REMOTE_CONTROL"},
		"name":          {"Songify"},
		"id":            {ls.screenID},
		"loungeIdToken": {ls.loungeToken},
		"VER":           {"8"},
		"RID":           {strconv.Itoa(ls.rid)},
	}

	bindURL := fmt.Sprintf("%s/bc/bind?%s", loungeBaseURL, params.Encode())

	req, err := http.NewRequestWithContext(ctx, "POST", bindURL, strings.NewReader("count=0"))
	if err != nil {
		return fmt.Errorf("failed to create bind request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := ls.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("bind request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read bind response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("bind failed with status %d: %s", resp.StatusCode, string(body))
	}

	sid, gsessionID, err := parseBindResponse(body)
	if err != nil {
		return err
	}

	ls.sid = sid
	ls.gsessionID = gsessionID
	return nil
}

// sendCommand sends a command (addVideo, setVideo) to the TV.
func (ls *loungeSession) sendCommand(command, videoID string, extraParams map[string]string) error {
	ls.rid++

	queryParams := url.Values{
		"device":        {"REMOTE_CONTROL"},
		"name":          {"Songify"},
		"id":            {ls.screenID},
		"loungeIdToken": {ls.loungeToken},
		"VER":           {"8"},
		"RID":           {strconv.Itoa(ls.rid)},
		"SID":           {ls.sid},
		"AID":           {strconv.Itoa(ls.aid)},
	}
	if ls.gsessionID != "" {
		queryParams.Set("gsessionid", ls.gsessionID)
	}

	formData := url.Values{
		"count":        {"1"},
		"ofs":          {strconv.Itoa(ls.ofs)},
		"req0__sc":     {command},
		"req0_videoId": {videoID},
	}

	for k, v := range extraParams {
		formData.Set("req0_"+k, v)
	}

	cmdURL := fmt.Sprintf("%s/bc/bind?%s", loungeBaseURL, queryParams.Encode())

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "POST", cmdURL, strings.NewReader(formData.Encode()))
	if err != nil {
		return fmt.Errorf("failed to create command request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := ls.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("command request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("command failed with status %d: %s", resp.StatusCode, string(body))
	}

	ls.ofs++
	ls.lastActivity = time.Now()
	return nil
}

// longPollLoop runs in a goroutine, long-polling the TV for events.
// Stops on context cancel, 30-min inactivity, or 3 consecutive errors.
func (m *LoungeManager) longPollLoop(ctx context.Context, sessionID string, ls *loungeSession) {
	slog.Info("lounge: long-poll loop started", slog.String("session_id", sessionID))
	consecutiveErrors := 0

	for {
		select {
		case <-ctx.Done():
			slog.Info("lounge: long-poll loop stopped (context cancelled)", slog.String("session_id", sessionID))
			return
		default:
		}

		// Check inactivity
		m.mu.Lock()
		if time.Since(ls.lastActivity) > loungeInactivityTimeout {
			ls.status = LoungeStatusError
			ls.errorMsg = "disconnected due to inactivity"
			m.mu.Unlock()
			slog.Info("lounge: disconnected due to inactivity", slog.String("session_id", sessionID))
			return
		}
		m.mu.Unlock()

		err := ls.longPoll(ctx)
		if err != nil {
			if ctx.Err() != nil {
				slog.Info("lounge: long-poll loop stopped (context cancelled)", slog.String("session_id", sessionID))
				return
			}

			consecutiveErrors++
			slog.Error("lounge: poll error", slog.String("session_id", sessionID), slog.Int("consecutive_errors", consecutiveErrors), slog.String("error", err.Error()))

			if consecutiveErrors >= loungeMaxRetries {
				m.mu.Lock()
				ls.status = LoungeStatusError
				ls.errorMsg = fmt.Sprintf("disconnected after %d consecutive poll errors: %v", loungeMaxRetries, err)
				m.mu.Unlock()
				slog.Error("lounge: disconnected after max poll retries", slog.String("session_id", sessionID))
				return
			}

			// Exponential backoff
			delay := loungeRetryBaseDelay * time.Duration(1<<(consecutiveErrors-1))
			slog.Info("lounge: retrying poll after backoff", slog.String("session_id", sessionID), slog.Duration("delay", delay))
			select {
			case <-ctx.Done():
				return
			case <-time.After(delay):
			}
			continue
		}

		consecutiveErrors = 0
	}
}

// longPoll performs a single long-poll request to the TV.
func (ls *loungeSession) longPoll(ctx context.Context) error {
	params := url.Values{
		"device":        {"REMOTE_CONTROL"},
		"name":          {"Songify"},
		"id":            {ls.screenID},
		"loungeIdToken": {ls.loungeToken},
		"VER":           {"8"},
		"SID":           {ls.sid},
		"AID":           {strconv.Itoa(ls.aid)},
		"CI":            {"0"},
		"TYPE":          {"xmlhttp"},
		"RID":           {"rpc"},
	}
	if ls.gsessionID != "" {
		params.Set("gsessionid", ls.gsessionID)
	}

	pollURL := fmt.Sprintf("%s/bc/bind?%s", loungeBaseURL, params.Encode())

	// Long poll with extended timeout
	pollClient := &http.Client{Timeout: 3 * time.Minute}

	req, err := http.NewRequestWithContext(ctx, "GET", pollURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create poll request: %w", err)
	}

	resp, err := pollClient.Do(req)
	if err != nil {
		return fmt.Errorf("poll request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read poll response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("poll failed with status %d: %s", resp.StatusCode, string(body))
	}

	// Extract latest AID from response
	if newAID, err := parseLongPollAID(body); err == nil {
		ls.aid = newAID
	}

	return nil
}

// disconnect cancels the long-poll goroutine and marks the session as disconnected.
func (ls *loungeSession) disconnect() {
	if ls.cancel != nil {
		ls.cancel()
	}
	ls.status = LoungeStatusDisconnected
}

// parsePairingResponse parses the JSON response from the pairing endpoint.
func parsePairingResponse(body []byte) (screenID, loungeToken, screenName string, err error) {
	var result struct {
		Screen struct {
			ScreenID    string `json:"screenId"`
			LoungeToken string `json:"loungeToken"`
			ScreenName  string `json:"screenName"`
		} `json:"screen"`
	}

	if err := json.Unmarshal(body, &result); err != nil {
		return "", "", "", fmt.Errorf("failed to parse pairing response: %w", err)
	}

	if result.Screen.ScreenID == "" || result.Screen.LoungeToken == "" {
		return "", "", "", fmt.Errorf("invalid pairing response: missing screenId or loungeToken")
	}

	return result.Screen.ScreenID, result.Screen.LoungeToken, result.Screen.ScreenName, nil
}

// parseBindResponse parses the length-prefixed array format from bind responses
// to extract SID and gsessionid values.
func parseBindResponse(body []byte) (sid, gsessionID string, err error) {
	text := string(body)

	// The bind response uses a custom format with length-prefixed lines.
	// Extract SID - appears as ["c","<SID>", in the response
	sidIdx := strings.Index(text, `["c","`)
	if sidIdx >= 0 {
		start := sidIdx + 6 // len(`["c","`)
		end := strings.Index(text[start:], `"`)
		if end > 0 {
			sid = text[start : start+end]
		}
	}

	// Extract gsessionid - appears as ["S","<gsessionid>"] in the response
	gsIdx := strings.Index(text, `["S","`)
	if gsIdx >= 0 {
		start := gsIdx + 6 // len(`["S","`)
		end := strings.Index(text[start:], `"`)
		if end > 0 {
			gsessionID = text[start : start+end]
		}
	}

	if sid == "" {
		return "", "", fmt.Errorf("failed to parse SID from bind response")
	}

	return sid, gsessionID, nil
}

// parseLongPollAID extracts the latest event AID from a long-poll response.
func parseLongPollAID(body []byte) (int, error) {
	text := string(body)

	// The long-poll response contains events as arrays: [[AID, [...]]]
	// We find the highest AID value.
	maxAID := -1

	lines := strings.Split(text, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		for _, prefix := range []string{"[[", ",["} {
			idx := strings.Index(line, prefix)
			for idx >= 0 {
				numStart := idx + len(prefix)
				numEnd := strings.IndexAny(line[numStart:], ",]")
				if numEnd > 0 {
					if aid, err := strconv.Atoi(strings.TrimSpace(line[numStart : numStart+numEnd])); err == nil {
						if aid > maxAID {
							maxAID = aid
						}
					}
				}
				nextIdx := strings.Index(line[numStart:], prefix)
				if nextIdx >= 0 {
					idx = numStart + nextIdx
				} else {
					idx = -1
				}
			}
		}
	}

	if maxAID < 0 {
		return 0, fmt.Errorf("no AID found in poll response")
	}

	return maxAID, nil
}

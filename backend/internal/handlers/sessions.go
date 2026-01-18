package handlers

import (
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/songify/backend/internal/db"
	"github.com/songify/backend/internal/middleware"
	"github.com/songify/backend/internal/models"
	"github.com/songify/backend/internal/services"
	"golang.org/x/crypto/scrypt"
)

type SessionHandler struct {
	queries          *db.Queries
	authService      *services.AuthService
	friendKeyService *services.FriendKeyService
}

func NewSessionHandler(queries *db.Queries, authService *services.AuthService, friendKeyService *services.FriendKeyService) *SessionHandler {
	return &SessionHandler{
		queries:          queries,
		authService:      authService,
		friendKeyService: friendKeyService,
	}
}

// hashFriendKey hashes a friend key using scrypt with UTC day as salt
// Parameters match the frontend: N=16384, r=8, p=1, keyLen=32
func hashFriendKey(friendKey string) string {
	// Normalize the key the same way as frontend
	normalizedKey := strings.ToLower(strings.TrimSpace(friendKey))
	// Use UTC day as salt (same as admin portal password)
	utcDay := strconv.Itoa(time.Now().UTC().Day())
	saltBytes := []byte(utcDay)
	// N=16384 (2^14), r=8, p=1, keyLen=32
	dk, err := scrypt.Key([]byte(normalizedKey), saltBytes, 16384, 8, 1, 32)
	if err != nil {
		return ""
	}
	return hex.EncodeToString(dk)
}

func (h *SessionHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req models.CreateSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.DisplayName == "" || req.AdminName == "" || req.AdminPasswordHash == "" {
		writeError(w, http.StatusBadRequest, "displayName, adminName, and adminPasswordHash are required")
		return
	}

	friendKey, err := h.friendKeyService.Generate(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate friend key")
		return
	}

	sessionID := uuid.New().String()

	var playlistID sql.NullString
	var durationLimit sql.NullInt64
	if req.SpotifyPlaylistID != nil {
		playlistID = sql.NullString{String: *req.SpotifyPlaylistID, Valid: true}
	}
	if req.SongDurationLimitMs != nil {
		durationLimit = sql.NullInt64{Int64: *req.SongDurationLimitMs, Valid: true}
	}

	session, err := h.queries.CreateSession(r.Context(), db.CreateSessionParams{
		ID:                  sessionID,
		DisplayName:         req.DisplayName,
		AdminName:           req.AdminName,
		AdminPasswordHash:   req.AdminPasswordHash,
		FriendAccessKey:     friendKey,
		SpotifyPlaylistID:   playlistID,
		SongDurationLimitMs: durationLimit,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	// Add prohibited patterns
	for _, pattern := range req.ProhibitedArtists {
		if _, err := h.queries.CreateProhibitedPattern(r.Context(), db.CreateProhibitedPatternParams{
			SessionID:   session.ID,
			PatternType: "artist",
			Pattern:     pattern,
		}); err != nil {
			// Log but don't fail
		}
	}
	for _, pattern := range req.ProhibitedTitles {
		if _, err := h.queries.CreateProhibitedPattern(r.Context(), db.CreateProhibitedPatternParams{
			SessionID:   session.ID,
			PatternType: "title",
			Pattern:     pattern,
		}); err != nil {
			// Log but don't fail
		}
	}

	token, err := h.authService.GenerateToken(session.ID, services.RoleAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	writeJSON(w, http.StatusCreated, models.CreateSessionResponse{
		SessionID:       session.ID,
		FriendAccessKey: session.FriendAccessKey,
		Token:           token,
	})
}

func (h *SessionHandler) Join(w http.ResponseWriter, r *http.Request) {
	var req models.JoinSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.FriendKeyHash == "" {
		writeError(w, http.StatusBadRequest, "friendKeyHash is required")
		return
	}

	// Find session by comparing hashed friend keys
	sessions, err := h.queries.ListAllSessions(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch sessions")
		return
	}

	var matchedSession *db.Session
	for i := range sessions {
		if hashFriendKey(sessions[i].FriendAccessKey) == req.FriendKeyHash {
			matchedSession = &sessions[i]
			break
		}
	}

	if matchedSession == nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	token, err := h.authService.GenerateToken(matchedSession.ID, services.RoleFriend)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	writeJSON(w, http.StatusOK, models.JoinSessionResponse{
		SessionID:   matchedSession.ID,
		DisplayName: matchedSession.DisplayName,
		Token:       token,
	})
}

func (h *SessionHandler) Rejoin(w http.ResponseWriter, r *http.Request) {
	var req models.RejoinSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.FriendKeyHash == "" || req.AdminPasswordHash == "" {
		writeError(w, http.StatusBadRequest, "friendKeyHash and adminPasswordHash are required")
		return
	}

	// Find session by comparing hashed friend keys
	sessions, err := h.queries.ListAllSessions(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch sessions")
		return
	}

	var matchedSession *db.Session
	for i := range sessions {
		if hashFriendKey(sessions[i].FriendAccessKey) == req.FriendKeyHash {
			matchedSession = &sessions[i]
			break
		}
	}

	if matchedSession == nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	// Verify the admin password
	if matchedSession.AdminPasswordHash != req.AdminPasswordHash {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	token, err := h.authService.GenerateToken(matchedSession.ID, services.RoleAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	writeJSON(w, http.StatusOK, models.RejoinSessionResponse{
		SessionID:       matchedSession.ID,
		DisplayName:     matchedSession.DisplayName,
		FriendAccessKey: matchedSession.FriendAccessKey,
		Token:           token,
	})
}

func (h *SessionHandler) Get(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	claims := middleware.GetClaims(r.Context())

	if claims.SessionID != sessionID {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	session, err := h.queries.GetSessionByID(r.Context(), sessionID)
	if err != nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	isAdmin := claims.Role == services.RoleAdmin

	resp := models.SessionResponse{
		ID:          session.ID,
		DisplayName: session.DisplayName,
		AdminName:   session.AdminName,
		CreatedAt:   session.CreatedAt.Time,
		IsAdmin:     isAdmin,
	}

	if session.SpotifyPlaylistID.Valid {
		resp.SpotifyPlaylistID = &session.SpotifyPlaylistID.String
	}
	if session.SpotifyPlaylistName.Valid {
		resp.SpotifyPlaylistName = &session.SpotifyPlaylistName.String
	}
	if session.SongDurationLimitMs.Valid {
		resp.SongDurationLimitMs = &session.SongDurationLimitMs.Int64
	}

	if isAdmin {
		resp.FriendAccessKey = session.FriendAccessKey
	}

	// Fetch prohibited patterns
	patterns, err := h.queries.GetProhibitedPatternsBySessionID(r.Context(), sessionID)
	if err == nil && len(patterns) > 0 {
		resp.ProhibitedPatterns = make([]models.ProhibitedPatternResponse, len(patterns))
		for i, p := range patterns {
			resp.ProhibitedPatterns[i] = models.ProhibitedPatternResponse{
				ID:          p.ID,
				PatternType: p.PatternType,
				Pattern:     p.Pattern,
			}
		}
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *SessionHandler) UpdatePlaylist(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	claims := middleware.GetClaims(r.Context())

	if claims.SessionID != sessionID {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	if claims.Role != services.RoleAdmin {
		writeError(w, http.StatusForbidden, "admin access required")
		return
	}

	var req models.UpdatePlaylistRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.SpotifyPlaylistID == "" {
		writeError(w, http.StatusBadRequest, "spotifyPlaylistId is required")
		return
	}

	err := h.queries.UpdateSessionPlaylist(r.Context(), db.UpdateSessionPlaylistParams{
		ID:                  sessionID,
		SpotifyPlaylistID:   sql.NullString{String: req.SpotifyPlaylistID, Valid: true},
		SpotifyPlaylistName: sql.NullString{String: req.SpotifyPlaylistName, Valid: req.SpotifyPlaylistName != ""},
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update playlist")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *SessionHandler) UpdateDurationLimit(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	claims := middleware.GetClaims(r.Context())

	if claims.SessionID != sessionID {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	if claims.Role != services.RoleAdmin {
		writeError(w, http.StatusForbidden, "admin access required")
		return
	}

	var req models.UpdateDurationLimitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var durationLimit sql.NullInt64
	if req.SongDurationLimitMs != nil {
		durationLimit = sql.NullInt64{Int64: *req.SongDurationLimitMs, Valid: true}
	}

	err := h.queries.UpdateSessionSettings(r.Context(), db.UpdateSessionSettingsParams{
		ID:                  sessionID,
		SongDurationLimitMs: durationLimit,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update duration limit")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *SessionHandler) GetProhibitedPatterns(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	claims := middleware.GetClaims(r.Context())

	if claims.SessionID != sessionID {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	if claims.Role != services.RoleAdmin {
		writeError(w, http.StatusForbidden, "admin access required")
		return
	}

	patterns, err := h.queries.GetProhibitedPatternsBySessionID(r.Context(), sessionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch patterns")
		return
	}

	resp := make([]models.ProhibitedPatternResponse, len(patterns))
	for i, p := range patterns {
		resp[i] = models.ProhibitedPatternResponse{
			ID:          p.ID,
			PatternType: p.PatternType,
			Pattern:     p.Pattern,
		}
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *SessionHandler) CreateProhibitedPattern(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	claims := middleware.GetClaims(r.Context())

	if claims.SessionID != sessionID {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	if claims.Role != services.RoleAdmin {
		writeError(w, http.StatusForbidden, "admin access required")
		return
	}

	var req models.CreatePatternRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.PatternType != "artist" && req.PatternType != "title" {
		writeError(w, http.StatusBadRequest, "patternType must be 'artist' or 'title'")
		return
	}

	if req.Pattern == "" {
		writeError(w, http.StatusBadRequest, "pattern is required")
		return
	}

	pattern, err := h.queries.CreateProhibitedPattern(r.Context(), db.CreateProhibitedPatternParams{
		SessionID:   sessionID,
		PatternType: req.PatternType,
		Pattern:     req.Pattern,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create pattern")
		return
	}

	writeJSON(w, http.StatusCreated, models.ProhibitedPatternResponse{
		ID:          pattern.ID,
		PatternType: pattern.PatternType,
		Pattern:     pattern.Pattern,
	})
}

func (h *SessionHandler) DeleteProhibitedPattern(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	patternIDStr := chi.URLParam(r, "patternId")
	claims := middleware.GetClaims(r.Context())

	if claims.SessionID != sessionID {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	if claims.Role != services.RoleAdmin {
		writeError(w, http.StatusForbidden, "admin access required")
		return
	}

	patternID, err := strconv.ParseInt(patternIDStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid pattern ID")
		return
	}

	if err := h.queries.DeleteProhibitedPattern(r.Context(), patternID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete pattern")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

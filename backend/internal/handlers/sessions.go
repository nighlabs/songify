package handlers

import (
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/songify/backend/internal/config"
	"github.com/songify/backend/internal/crypto"
	"github.com/songify/backend/internal/db"
	"github.com/songify/backend/internal/logging"
	"github.com/songify/backend/internal/middleware"
	"github.com/songify/backend/internal/models"
	"github.com/songify/backend/internal/services"
)

// SessionHandler manages session lifecycle: creation, joining, and settings.
type SessionHandler struct {
	queries          *db.Queries
	authService      *services.AuthService
	friendKeyService *services.FriendKeyService
	cfg              *config.Config
}

// NewSessionHandler creates a SessionHandler with the required dependencies.
func NewSessionHandler(queries *db.Queries, authService *services.AuthService, friendKeyService *services.FriendKeyService, cfg *config.Config) *SessionHandler {
	return &SessionHandler{
		queries:          queries,
		authService:      authService,
		friendKeyService: friendKeyService,
		cfg:              cfg,
	}
}

// Create initializes a new session with the admin as owner.
// Returns the session ID, friend access key, and admin JWT token.
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

	if req.MusicService == "" {
		req.MusicService = "spotify"
	}
	if req.MusicService != "spotify" && req.MusicService != "youtube" {
		writeError(w, http.StatusBadRequest, "musicService must be 'spotify' or 'youtube'")
		return
	}

	// Verify admin portal password
	utcDay := strconv.Itoa(time.Now().UTC().Day())
	expectedPortalHash, err := crypto.HashWithScrypt(h.cfg.AdminPortalPassword, utcDay)
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to hash admin portal password", err)
		return
	}
	if req.AdminPortalPasswordHash != expectedPortalHash {
		logging.LogSecurityEvent(r.Context(), logging.SecurityEventBadAdminPassword, "invalid admin portal password on session creation")
		writeError(w, http.StatusUnauthorized, "invalid admin portal password")
		return
	}

	friendKey, err := h.friendKeyService.Generate(r.Context())
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to generate friend key", err)
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
		MusicService:        req.MusicService,
	})
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to create session", err)
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

	token, err := h.authService.GenerateToken(session.ID, services.RoleAdmin, session.AdminName)
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to generate token", err)
		return
	}

	writeJSON(w, http.StatusCreated, models.CreateSessionResponse{
		SessionID:       session.ID,
		FriendAccessKey: session.FriendAccessKey,
		Token:           token,
	})
}

// Join allows a friend to enter a session using the shared friend key.
// The friend key is hashed client-side before being sent for comparison.
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
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to fetch sessions", err)
		return
	}

	var matchedSession *db.Session
	for i := range sessions {
		hash, err := crypto.HashFriendKey(sessions[i].FriendAccessKey)
		if err != nil {
			slog.Error("failed to hash friend key", slog.String("error", err.Error()))
			continue
		}
		if hash == req.FriendKeyHash {
			matchedSession = &sessions[i]
			break
		}
	}

	if matchedSession == nil {
		logging.LogSecurityEvent(r.Context(), logging.SecurityEventBadJoinCode, "invalid friend key hash")
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	generatedName := h.friendKeyService.GenerateName()
	displayName := strings.TrimSpace(req.DisplayName)
	var identity string
	if displayName != "" {
		if len(displayName) > 20 {
			displayName = displayName[:20]
		}
		identity = displayName + " [" + generatedName + "]"
	} else {
		identity = generatedName
	}
	token, err := h.authService.GenerateToken(matchedSession.ID, services.RoleFriend, identity)
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to generate token", err)
		return
	}

	writeJSON(w, http.StatusOK, models.JoinSessionResponse{
		SessionID:   matchedSession.ID,
		DisplayName: matchedSession.DisplayName,
		Identity:    identity,
		Token:       token,
	})
}

// Rejoin allows an admin to reclaim their session after losing their token.
// Requires both the friend key hash and admin password hash for verification.
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
	allSessions, err := h.queries.ListAllSessions(r.Context())
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to fetch sessions", err)
		return
	}

	var matchedSession *db.Session
	for i := range allSessions {
		hash, err := crypto.HashFriendKey(allSessions[i].FriendAccessKey)
		if err != nil {
			slog.Error("failed to hash friend key", slog.String("error", err.Error()))
			continue
		}
		if hash == req.FriendKeyHash {
			matchedSession = &allSessions[i]
			break
		}
	}

	if matchedSession == nil {
		logging.LogSecurityEvent(r.Context(), logging.SecurityEventBadJoinCode, "invalid friend key hash on rejoin")
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	// Verify the admin password
	if matchedSession.AdminPasswordHash != req.AdminPasswordHash {
		logging.LogSecurityEvent(r.Context(), logging.SecurityEventBadAdminPassword, "invalid admin password on rejoin")
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	token, err := h.authService.GenerateToken(matchedSession.ID, services.RoleAdmin, matchedSession.AdminName)
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to generate token", err)
		return
	}

	writeJSON(w, http.StatusOK, models.RejoinSessionResponse{
		SessionID:       matchedSession.ID,
		DisplayName:     matchedSession.DisplayName,
		FriendAccessKey: matchedSession.FriendAccessKey,
		Token:           token,
	})
}

// Get returns the session details. Admins see additional fields like the friend key.
func (h *SessionHandler) Get(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	claims := middleware.GetClaims(r.Context())

	if claims.SessionID != sessionID {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	session, err := h.queries.GetSessionByID(r.Context(), sessionID)
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusNotFound, "session not found", err)
		return
	}

	isAdmin := claims.Role == services.RoleAdmin

	resp := models.SessionResponse{
		ID:           session.ID,
		DisplayName:  session.DisplayName,
		AdminName:    session.AdminName,
		MusicService: session.MusicService,
		CreatedAt:    session.CreatedAt.Time,
		IsAdmin:      isAdmin,
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

// UpdateDurationLimit sets or clears the maximum allowed song duration.
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
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to update duration limit", err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// GetProhibitedPatterns returns all artist/title patterns that block song requests.
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
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to fetch patterns", err)
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

// CreateProhibitedPattern adds a new pattern to block certain artists or song titles.
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
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to create pattern", err)
		return
	}

	writeJSON(w, http.StatusCreated, models.ProhibitedPatternResponse{
		ID:          pattern.ID,
		PatternType: pattern.PatternType,
		Pattern:     pattern.Pattern,
	})
}

// DeleteProhibitedPattern removes a blocked pattern by its ID.
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

	result, err := h.queries.DeleteProhibitedPatternBySession(r.Context(), db.DeleteProhibitedPatternBySessionParams{
		ID:        patternID,
		SessionID: sessionID,
	})
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to delete pattern", err)
		return
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to check deletion result", err)
		return
	}
	if rowsAffected == 0 {
		writeError(w, http.StatusNotFound, "pattern not found")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

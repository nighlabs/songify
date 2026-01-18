package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/songify/backend/internal/db"
	"github.com/songify/backend/internal/middleware"
	"github.com/songify/backend/internal/models"
	"github.com/songify/backend/internal/services"
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

	if req.FriendAccessKey == "" {
		writeError(w, http.StatusBadRequest, "friendAccessKey is required")
		return
	}

	session, err := h.queries.GetSessionByFriendKey(r.Context(), req.FriendAccessKey)
	if err != nil {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	token, err := h.authService.GenerateToken(session.ID, services.RoleFriend)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	writeJSON(w, http.StatusOK, models.JoinSessionResponse{
		SessionID:   session.ID,
		DisplayName: session.DisplayName,
		Token:       token,
	})
}

func (h *SessionHandler) Rejoin(w http.ResponseWriter, r *http.Request) {
	var req models.RejoinSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.AdminName == "" || req.AdminPasswordHash == "" {
		writeError(w, http.StatusBadRequest, "adminName and adminPasswordHash are required")
		return
	}

	session, err := h.queries.GetSessionByAdminCredentials(r.Context(), db.GetSessionByAdminCredentialsParams{
		AdminName:         req.AdminName,
		AdminPasswordHash: req.AdminPasswordHash,
	})
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	token, err := h.authService.GenerateToken(session.ID, services.RoleAdmin)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate token")
		return
	}

	writeJSON(w, http.StatusOK, models.RejoinSessionResponse{
		SessionID:       session.ID,
		DisplayName:     session.DisplayName,
		FriendAccessKey: session.FriendAccessKey,
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
	if session.SongDurationLimitMs.Valid {
		resp.SongDurationLimitMs = &session.SongDurationLimitMs.Int64
	}

	if isAdmin {
		resp.FriendAccessKey = session.FriendAccessKey
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
		ID:                sessionID,
		SpotifyPlaylistID: sql.NullString{String: req.SpotifyPlaylistID, Valid: true},
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update playlist")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

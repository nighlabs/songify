package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/songify/backend/internal/db"
	"github.com/songify/backend/internal/middleware"
	"github.com/songify/backend/internal/models"
	"github.com/songify/backend/internal/services"
)

// YouTubeHandler handles YouTube-specific requests: video search and Lounge TV pairing.
type YouTubeHandler struct {
	youtubeService *services.YouTubeService
	loungeManager  *services.LoungeManager
	queries        *db.Queries
}

// NewYouTubeHandler creates a YouTubeHandler with the given YouTube service, lounge manager, and database queries.
func NewYouTubeHandler(youtubeService *services.YouTubeService, loungeManager *services.LoungeManager, queries *db.Queries) *YouTubeHandler {
	return &YouTubeHandler{youtubeService: youtubeService, loungeManager: loungeManager, queries: queries}
}

// Search handles video search queries, returning matching videos from YouTube.
func (h *YouTubeHandler) Search(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		writeError(w, http.StatusBadRequest, "query parameter 'q' is required")
		return
	}

	videos, err := h.youtubeService.Search(r.Context(), query, 20)
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "search failed", err)
		return
	}

	response := models.YouTubeSearchResponse{
		Videos: make([]models.YouTubeVideoResponse, len(videos)),
	}

	for i, video := range videos {
		response.Videos[i] = models.YouTubeVideoResponse{
			ID:           video.ID,
			Title:        video.Title,
			ChannelTitle: video.ChannelTitle,
			ThumbnailURL: video.ThumbnailURL,
			DurationMS:   video.DurationMS,
		}
	}

	writeJSON(w, http.StatusOK, response)
}

// Pair pairs the session with a YouTube TV using a pairing code.
func (h *YouTubeHandler) Pair(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	claims := middleware.GetClaims(r.Context())

	if err := requireAdmin(claims, sessionID); err != nil {
		writeError(w, http.StatusForbidden, "admin access required")
		return
	}

	// Verify this is a YouTube session
	session, err := h.queries.GetSessionByID(r.Context(), sessionID)
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusNotFound, "session not found", err)
		return
	}
	if session.MusicService != "youtube" {
		writeError(w, http.StatusBadRequest, "lounge pairing is only available for YouTube sessions")
		return
	}

	var req models.PairLoungeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.PairingCode == "" {
		writeError(w, http.StatusBadRequest, "pairing code is required")
		return
	}

	if err := h.loungeManager.Pair(r.Context(), sessionID, req.PairingCode); err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusBadGateway, "failed to pair with TV", err)
		return
	}

	writeJSON(w, http.StatusOK, h.buildLoungeStatusResponse(sessionID))
}

// Disconnect disconnects from a paired YouTube TV.
func (h *YouTubeHandler) Disconnect(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	claims := middleware.GetClaims(r.Context())

	if err := requireAdmin(claims, sessionID); err != nil {
		writeError(w, http.StatusForbidden, "admin access required")
		return
	}

	h.loungeManager.Disconnect(sessionID)
	writeJSON(w, http.StatusOK, models.LoungeStatusResponse{Status: string(services.LoungeStatusDisconnected)})
}

// Reconnect re-binds to the TV using existing credentials without a new pairing code.
func (h *YouTubeHandler) Reconnect(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	claims := middleware.GetClaims(r.Context())

	if err := requireAdmin(claims, sessionID); err != nil {
		writeError(w, http.StatusForbidden, "admin access required")
		return
	}

	if err := h.loungeManager.Reconnect(r.Context(), sessionID); err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusBadGateway, "failed to reconnect to TV", err)
		return
	}

	writeJSON(w, http.StatusOK, h.buildLoungeStatusResponse(sessionID))
}

// LoungeStatus returns the current YouTube TV connection status.
func (h *YouTubeHandler) LoungeStatus(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	claims := middleware.GetClaims(r.Context())

	if err := requireAdmin(claims, sessionID); err != nil {
		writeError(w, http.StatusForbidden, "admin access required")
		return
	}

	writeJSON(w, http.StatusOK, h.buildLoungeStatusResponse(sessionID))
}

func (h *YouTubeHandler) buildLoungeStatusResponse(sessionID string) models.LoungeStatusResponse {
	status, screenName, errMsg := h.loungeManager.Status(sessionID)
	resp := models.LoungeStatusResponse{Status: string(status)}
	if screenName != "" {
		resp.ScreenName = &screenName
	}
	if errMsg != "" {
		resp.Error = &errMsg
	}
	return resp
}

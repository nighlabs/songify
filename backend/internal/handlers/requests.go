package handlers

import (
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/songify/backend/internal/broker"
	"github.com/songify/backend/internal/db"
	"github.com/songify/backend/internal/middleware"
	"github.com/songify/backend/internal/models"
	"github.com/songify/backend/internal/services"
)

// RequestHandler manages song request operations: listing, submitting, and moderation.
type RequestHandler struct {
	queries       *db.Queries
	broker        *broker.Broker
	loungeManager *services.LoungeManager
}

// NewRequestHandler creates a RequestHandler with the given database queries, event broker, and lounge manager.
func NewRequestHandler(queries *db.Queries, broker *broker.Broker, loungeManager *services.LoungeManager) *RequestHandler {
	return &RequestHandler{queries: queries, broker: broker, loungeManager: loungeManager}
}

// List returns all song requests for the session, ordered by request time.
func (h *RequestHandler) List(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	claims := middleware.GetClaims(r.Context())

	if err := requireSession(claims, sessionID); err != nil {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	requests, err := h.queries.GetSongRequestsBySessionID(r.Context(), sessionID)
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to fetch requests", err)
		return
	}

	response := make([]models.SongRequestResponse, len(requests))
	for i, req := range requests {
		response[i] = songRequestToResponse(req)
	}

	writeJSON(w, http.StatusOK, response)
}

// Submit adds a new song request after validating against session rules.
// Checks for duplicates, duration limits, and prohibited patterns.
func (h *RequestHandler) Submit(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	claims := middleware.GetClaims(r.Context())

	if err := requireSession(claims, sessionID); err != nil {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	var req models.SubmitSongRequestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Get session to check limits and patterns
	session, err := h.queries.GetSessionByID(r.Context(), sessionID)
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusNotFound, "session not found", err)
		return
	}

	// Check duration limit
	if session.SongDurationLimitMs.Valid && req.DurationMS > session.SongDurationLimitMs.Int64 {
		writeError(w, http.StatusBadRequest, "Song exceeds duration limit")
		return
	}

	// Check for duplicate
	isDuplicate, err := h.queries.IsDuplicateRequest(r.Context(), db.IsDuplicateRequestParams{
		SessionID:       sessionID,
		ExternalTrackID: req.ExternalTrackID,
	})
	if err == nil && isDuplicate == 1 {
		writeError(w, http.StatusConflict, "Song already requested")
		return
	}

	// Check prohibited patterns
	patterns, err := h.queries.GetProhibitedPatternsBySessionID(r.Context(), sessionID)
	if err == nil {
		for _, p := range patterns {
			if p.PatternType == "artist" && containsIgnoreCase(req.ArtistNames, p.Pattern) {
				writeError(w, http.StatusBadRequest, "Artist is prohibited")
				return
			}
			if p.PatternType == "title" && containsIgnoreCase(req.TrackName, p.Pattern) {
				writeError(w, http.StatusBadRequest, "Song title contains prohibited words")
				return
			}
		}
	}

	var albumArtURL sql.NullString
	if req.AlbumArtURL != "" {
		albumArtURL = sql.NullString{String: req.AlbumArtURL, Valid: true}
	}

	var requesterName sql.NullString
	if claims.Identity != "" {
		requesterName = sql.NullString{String: claims.Identity, Valid: true}
	}

	songRequest, err := h.queries.CreateSongRequest(r.Context(), db.CreateSongRequestParams{
		SessionID:       sessionID,
		ExternalTrackID: req.ExternalTrackID,
		TrackName:       req.TrackName,
		ArtistNames:     req.ArtistNames,
		AlbumName:       req.AlbumName,
		AlbumArtUrl:     albumArtURL,
		DurationMs:      req.DurationMS,
		ExternalUri:     req.ExternalURI,
		RequesterName:   requesterName,
	})
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to create request", err)
		return
	}

	writeJSON(w, http.StatusCreated, songRequestToResponse(songRequest))
	h.broker.Publish(sessionID)
}

// Approve marks a pending song request as approved (admin only).
func (h *RequestHandler) Approve(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	requestID := chi.URLParam(r, "rid")
	claims := middleware.GetClaims(r.Context())

	if err := requireAdmin(claims, sessionID); err != nil {
		writeError(w, http.StatusForbidden, "admin access required")
		return
	}

	rid, err := strconv.ParseInt(requestID, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid request ID")
		return
	}

	// Verify request belongs to this session
	songRequest, err := h.queries.GetSongRequestByID(r.Context(), rid)
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusNotFound, "request not found", err)
		return
	}

	if songRequest.SessionID != sessionID {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	// If Lounge is connected, send addVideo before marking approved
	loungeConnected := h.loungeManager.IsConnected(sessionID)
	slog.Info("approve: lounge check", slog.String("session_id", sessionID), slog.Bool("lounge_connected", loungeConnected), slog.String("track_id", songRequest.ExternalTrackID))
	if loungeConnected {
		if err := h.loungeManager.SendAddVideo(sessionID, songRequest.ExternalTrackID); err != nil {
			writeErrorWithCause(r.Context(), w, http.StatusBadGateway, "failed to send video to TV", err)
			return
		}
	}

	if err := h.queries.ApproveSongRequest(r.Context(), rid); err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to approve request", err)
		return
	}

	// Fetch updated request
	updatedRequest, err := h.queries.GetSongRequestByID(r.Context(), rid)
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to fetch updated request", err)
		return
	}

	writeJSON(w, http.StatusOK, songRequestToResponse(updatedRequest))
	h.broker.Publish(sessionID)
}

// PlayNext approves a song request and plays it immediately on the TV (admin only).
func (h *RequestHandler) PlayNext(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	requestID := chi.URLParam(r, "rid")
	claims := middleware.GetClaims(r.Context())

	if err := requireAdmin(claims, sessionID); err != nil {
		writeError(w, http.StatusForbidden, "admin access required")
		return
	}

	rid, err := strconv.ParseInt(requestID, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid request ID")
		return
	}

	songRequest, err := h.queries.GetSongRequestByID(r.Context(), rid)
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusNotFound, "request not found", err)
		return
	}

	if songRequest.SessionID != sessionID {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	// Send setVideo to play immediately on TV
	loungeConnected := h.loungeManager.IsConnected(sessionID)
	slog.Info("play-next: lounge check", slog.String("session_id", sessionID), slog.Bool("lounge_connected", loungeConnected), slog.String("track_id", songRequest.ExternalTrackID))
	if loungeConnected {
		if err := h.loungeManager.SendSetVideo(sessionID, songRequest.ExternalTrackID); err != nil {
			writeErrorWithCause(r.Context(), w, http.StatusBadGateway, "failed to play video on TV", err)
			return
		}
	}

	if err := h.queries.ApproveSongRequest(r.Context(), rid); err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to approve request", err)
		return
	}

	updatedRequest, err := h.queries.GetSongRequestByID(r.Context(), rid)
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to fetch updated request", err)
		return
	}

	writeJSON(w, http.StatusOK, songRequestToResponse(updatedRequest))
	h.broker.Publish(sessionID)
}

// Reject marks a pending song request as rejected with an optional reason (admin only).
func (h *RequestHandler) Reject(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	requestID := chi.URLParam(r, "rid")
	claims := middleware.GetClaims(r.Context())

	if err := requireAdmin(claims, sessionID); err != nil {
		writeError(w, http.StatusForbidden, "admin access required")
		return
	}

	rid, err := strconv.ParseInt(requestID, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid request ID")
		return
	}

	var req models.RejectSongRequestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Verify request belongs to this session
	songRequest, err := h.queries.GetSongRequestByID(r.Context(), rid)
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusNotFound, "request not found", err)
		return
	}

	if songRequest.SessionID != sessionID {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	var reason sql.NullString
	if req.Reason != "" {
		reason = sql.NullString{String: req.Reason, Valid: true}
	}

	if err := h.queries.RejectSongRequest(r.Context(), db.RejectSongRequestParams{
		RejectionReason: reason,
		ID:              rid,
	}); err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to reject request", err)
		return
	}

	// Fetch updated request
	updatedRequest, err := h.queries.GetSongRequestByID(r.Context(), rid)
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to fetch updated request", err)
		return
	}

	writeJSON(w, http.StatusOK, songRequestToResponse(updatedRequest))
	h.broker.Publish(sessionID)
}

// ArchiveAll deletes all song requests for the session (admin only).
// Useful for clearing the queue when reusing a session.
func (h *RequestHandler) ArchiveAll(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	claims := middleware.GetClaims(r.Context())

	if err := requireAdmin(claims, sessionID); err != nil {
		writeError(w, http.StatusForbidden, "admin access required")
		return
	}

	if err := h.queries.DeleteAllSongRequestsBySessionID(r.Context(), sessionID); err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to archive requests", err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	h.broker.Publish(sessionID)
}

// songRequestToResponse converts a database song request to the API response format.
func songRequestToResponse(req db.SongRequest) models.SongRequestResponse {
	resp := models.SongRequestResponse{
		ID:              req.ID,
		ExternalTrackID: req.ExternalTrackID,
		TrackName:       req.TrackName,
		ArtistNames:     req.ArtistNames,
		AlbumName:       req.AlbumName,
		DurationMS:      req.DurationMs,
		ExternalURI:     req.ExternalUri,
		Status:          req.Status,
		RequestedAt:     req.RequestedAt.Time,
	}

	if req.AlbumArtUrl.Valid {
		resp.AlbumArtURL = &req.AlbumArtUrl.String
	}
	if req.ProcessedAt.Valid {
		resp.ProcessedAt = &req.ProcessedAt.Time
	}
	if req.RejectionReason.Valid {
		resp.RejectionReason = &req.RejectionReason.String
	}
	if req.RequesterName.Valid {
		resp.RequesterName = &req.RequesterName.String
	}

	return resp
}

// containsIgnoreCase checks if substr appears in s (case-insensitive).
func containsIgnoreCase(s, substr string) bool {
	return strings.Contains(strings.ToLower(s), strings.ToLower(substr))
}

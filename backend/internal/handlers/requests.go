package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/songify/backend/internal/db"
	"github.com/songify/backend/internal/middleware"
	"github.com/songify/backend/internal/models"
	"github.com/songify/backend/internal/services"
)

type RequestHandler struct {
	queries *db.Queries
}

func NewRequestHandler(queries *db.Queries) *RequestHandler {
	return &RequestHandler{queries: queries}
}

func (h *RequestHandler) List(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	claims := middleware.GetClaims(r.Context())

	if claims.SessionID != sessionID {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	requests, err := h.queries.GetSongRequestsBySessionID(r.Context(), sessionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch requests")
		return
	}

	response := make([]models.SongRequestResponse, len(requests))
	for i, req := range requests {
		response[i] = songRequestToResponse(req)
	}

	writeJSON(w, http.StatusOK, response)
}

func (h *RequestHandler) Submit(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	claims := middleware.GetClaims(r.Context())

	if claims.SessionID != sessionID {
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
		writeError(w, http.StatusNotFound, "session not found")
		return
	}

	// Check duration limit
	if session.SongDurationLimitMs.Valid && req.DurationMS > session.SongDurationLimitMs.Int64 {
		writeError(w, http.StatusBadRequest, "song exceeds duration limit")
		return
	}

	// Check for duplicate
	isDuplicate, err := h.queries.IsDuplicateRequest(r.Context(), db.IsDuplicateRequestParams{
		SessionID:      sessionID,
		SpotifyTrackID: req.SpotifyTrackID,
	})
	if err == nil && isDuplicate == 1 {
		writeError(w, http.StatusConflict, "song already requested")
		return
	}

	// Check prohibited patterns
	patterns, err := h.queries.GetProhibitedPatternsBySessionID(r.Context(), sessionID)
	if err == nil {
		for _, p := range patterns {
			if p.PatternType == "artist" && containsIgnoreCase(req.ArtistNames, p.Pattern) {
				writeError(w, http.StatusBadRequest, "artist is prohibited")
				return
			}
			if p.PatternType == "title" && containsIgnoreCase(req.TrackName, p.Pattern) {
				writeError(w, http.StatusBadRequest, "song title contains prohibited words")
				return
			}
		}
	}

	var albumArtURL sql.NullString
	if req.AlbumArtURL != "" {
		albumArtURL = sql.NullString{String: req.AlbumArtURL, Valid: true}
	}

	songRequest, err := h.queries.CreateSongRequest(r.Context(), db.CreateSongRequestParams{
		SessionID:      sessionID,
		SpotifyTrackID: req.SpotifyTrackID,
		TrackName:      req.TrackName,
		ArtistNames:    req.ArtistNames,
		AlbumName:      req.AlbumName,
		AlbumArtUrl:    albumArtURL,
		DurationMs:     req.DurationMS,
		SpotifyUri:     req.SpotifyURI,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create request")
		return
	}

	writeJSON(w, http.StatusCreated, songRequestToResponse(songRequest))
}

func (h *RequestHandler) Approve(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	requestID := chi.URLParam(r, "rid")
	claims := middleware.GetClaims(r.Context())

	if claims.SessionID != sessionID || claims.Role != services.RoleAdmin {
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
		writeError(w, http.StatusNotFound, "request not found")
		return
	}

	if songRequest.SessionID != sessionID {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	if err := h.queries.ApproveSongRequest(r.Context(), rid); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to approve request")
		return
	}

	// Fetch updated request
	updatedRequest, err := h.queries.GetSongRequestByID(r.Context(), rid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch updated request")
		return
	}

	writeJSON(w, http.StatusOK, songRequestToResponse(updatedRequest))
}

func (h *RequestHandler) Reject(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	requestID := chi.URLParam(r, "rid")
	claims := middleware.GetClaims(r.Context())

	if claims.SessionID != sessionID || claims.Role != services.RoleAdmin {
		writeError(w, http.StatusForbidden, "admin access required")
		return
	}

	rid, err := strconv.ParseInt(requestID, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid request ID")
		return
	}

	var req models.RejectSongRequestRequest
	json.NewDecoder(r.Body).Decode(&req)

	// Verify request belongs to this session
	songRequest, err := h.queries.GetSongRequestByID(r.Context(), rid)
	if err != nil {
		writeError(w, http.StatusNotFound, "request not found")
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
		writeError(w, http.StatusInternalServerError, "failed to reject request")
		return
	}

	// Fetch updated request
	updatedRequest, err := h.queries.GetSongRequestByID(r.Context(), rid)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch updated request")
		return
	}

	writeJSON(w, http.StatusOK, songRequestToResponse(updatedRequest))
}

func songRequestToResponse(req db.SongRequest) models.SongRequestResponse {
	resp := models.SongRequestResponse{
		ID:             req.ID,
		SpotifyTrackID: req.SpotifyTrackID,
		TrackName:      req.TrackName,
		ArtistNames:    req.ArtistNames,
		AlbumName:      req.AlbumName,
		DurationMS:     req.DurationMs,
		SpotifyURI:     req.SpotifyUri,
		Status:         req.Status,
		RequestedAt:    req.RequestedAt.Time,
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

	return resp
}

func containsIgnoreCase(s, substr string) bool {
	return strings.Contains(strings.ToLower(s), strings.ToLower(substr))
}

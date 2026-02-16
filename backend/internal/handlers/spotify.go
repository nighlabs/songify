package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/songify/backend/internal/db"
	"github.com/songify/backend/internal/middleware"
	"github.com/songify/backend/internal/models"
	"github.com/songify/backend/internal/services"
)

// SpotifyHandler handles Spotify-specific requests: search and playlist linking.
type SpotifyHandler struct {
	spotifyService *services.SpotifyService
	queries        *db.Queries
}

// NewSpotifyHandler creates a SpotifyHandler with the given Spotify service and database queries.
func NewSpotifyHandler(spotifyService *services.SpotifyService, queries *db.Queries) *SpotifyHandler {
	return &SpotifyHandler{spotifyService: spotifyService, queries: queries}
}

// Search handles track search queries, returning matching tracks from Spotify.
func (h *SpotifyHandler) Search(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		writeError(w, http.StatusBadRequest, "query parameter 'q' is required")
		return
	}

	tracks, err := h.spotifyService.Search(r.Context(), query, 20)
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "search failed", err)
		return
	}

	response := models.SpotifySearchResponse{
		Tracks: make([]models.SpotifyTrackResponse, len(tracks)),
	}

	for i, track := range tracks {
		artists := make([]string, len(track.Artists))
		for j, artist := range track.Artists {
			artists[j] = artist.Name
		}

		var albumArt string
		if len(track.Album.Images) > 0 {
			albumArt = track.Album.Images[0].URL
		}

		response.Tracks[i] = models.SpotifyTrackResponse{
			ID:          track.ID,
			Name:        track.Name,
			URI:         track.URI,
			DurationMS:  track.DurationMS,
			AlbumName:   track.Album.Name,
			AlbumArtURL: albumArt,
			Artists:     artists,
		}
	}

	writeJSON(w, http.StatusOK, response)
}

// UpdatePlaylist sets or updates the Spotify playlist for the session.
func (h *SpotifyHandler) UpdatePlaylist(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	claims := middleware.GetClaims(r.Context())

	if err := requireAdmin(claims, sessionID); err != nil {
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
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to update playlist", err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

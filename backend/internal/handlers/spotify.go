package handlers

import (
	"net/http"

	"github.com/songify/backend/internal/models"
	"github.com/songify/backend/internal/services"
)

// SpotifyHandler handles Spotify track search requests.
type SpotifyHandler struct {
	spotifyService *services.SpotifyService
}

// NewSpotifyHandler creates a SpotifyHandler with the given Spotify service.
func NewSpotifyHandler(spotifyService *services.SpotifyService) *SpotifyHandler {
	return &SpotifyHandler{spotifyService: spotifyService}
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

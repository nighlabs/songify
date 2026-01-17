package handlers

import (
	"net/http"

	"github.com/songify/backend/internal/models"
	"github.com/songify/backend/internal/services"
)

type SpotifyHandler struct {
	spotifyService *services.SpotifyService
}

func NewSpotifyHandler(spotifyService *services.SpotifyService) *SpotifyHandler {
	return &SpotifyHandler{spotifyService: spotifyService}
}

func (h *SpotifyHandler) Search(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		writeError(w, http.StatusBadRequest, "query parameter 'q' is required")
		return
	}

	tracks, err := h.spotifyService.Search(r.Context(), query, 20)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "search failed: "+err.Error())
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

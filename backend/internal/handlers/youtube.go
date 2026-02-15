package handlers

import (
	"net/http"

	"github.com/songify/backend/internal/db"
	"github.com/songify/backend/internal/models"
	"github.com/songify/backend/internal/services"
)

// YouTubeHandler handles YouTube-specific requests: video search.
type YouTubeHandler struct {
	youtubeService *services.YouTubeService
	queries        *db.Queries
}

// NewYouTubeHandler creates a YouTubeHandler with the given YouTube service and database queries.
func NewYouTubeHandler(youtubeService *services.YouTubeService, queries *db.Queries) *YouTubeHandler {
	return &YouTubeHandler{youtubeService: youtubeService, queries: queries}
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
		}
	}

	writeJSON(w, http.StatusOK, response)
}

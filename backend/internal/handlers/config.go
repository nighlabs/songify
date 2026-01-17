package handlers

import (
	"net/http"

	"github.com/songify/backend/internal/config"
)

type ConfigHandler struct {
	cfg *config.Config
}

func NewConfigHandler(cfg *config.Config) *ConfigHandler {
	return &ConfigHandler{cfg: cfg}
}

// PublicConfig returns non-sensitive configuration for the frontend
func (h *ConfigHandler) PublicConfig(w http.ResponseWriter, r *http.Request) {
	// Only expose public, non-sensitive configuration
	response := map[string]interface{}{
		"spotifyClientId": h.cfg.SpotifyClientID,
	}

	writeJSON(w, http.StatusOK, response)
}

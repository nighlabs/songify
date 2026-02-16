package handlers

import (
	"net/http"

	"github.com/songify/backend/internal/config"
)

// ConfigHandler exposes public configuration to the frontend.
type ConfigHandler struct {
	cfg *config.Config
}

// NewConfigHandler creates a ConfigHandler with the given configuration.
func NewConfigHandler(cfg *config.Config) *ConfigHandler {
	return &ConfigHandler{cfg: cfg}
}

// PublicConfig returns non-sensitive configuration for the frontend
func (h *ConfigHandler) PublicConfig(w http.ResponseWriter, r *http.Request) {
	// Only expose public, non-sensitive configuration
	response := map[string]interface{}{
		"spotifyClientId": h.cfg.SpotifyClientID,
		"spotify": map[string]interface{}{
			"clientId": h.cfg.SpotifyClientID,
		},
	}

	if h.cfg.SentryDSNFrontend != "" {
		response["sentryDsn"] = h.cfg.SentryDSNFrontend
		response["sentryEnvironment"] = h.cfg.SentryEnvironment
	}

	writeJSON(w, http.StatusOK, response)
}

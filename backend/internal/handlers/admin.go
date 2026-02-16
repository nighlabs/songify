// Package handlers contains HTTP request handlers for the Songify API.
// Each handler file corresponds to a specific resource or feature area.
package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/songify/backend/internal/config"
	"github.com/songify/backend/internal/crypto"
	"github.com/songify/backend/internal/logging"
	"github.com/songify/backend/internal/models"
)

// AdminHandler handles admin portal authentication.
type AdminHandler struct {
	cfg *config.Config
}

// NewAdminHandler creates an AdminHandler with the given configuration.
func NewAdminHandler(cfg *config.Config) *AdminHandler {
	return &AdminHandler{cfg: cfg}
}

// VerifyPassword checks if the provided password hash matches the admin portal password.
// The hash uses the current UTC day as a salt to prevent replay attacks.
func (h *AdminHandler) VerifyPassword(w http.ResponseWriter, r *http.Request) {
	var req models.VerifyAdminRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Hash the configured password using scrypt with UTC day as salt
	utcDay := strconv.Itoa(time.Now().UTC().Day())
	expectedHash, err := crypto.HashWithScrypt(h.cfg.AdminPortalPassword, utcDay)
	if err != nil {
		writeErrorWithCause(r.Context(), w, http.StatusInternalServerError, "failed to hash password", err)
		return
	}

	valid := req.PasswordHash == expectedHash

	if !valid {
		logging.LogSecurityEvent(r.Context(), logging.SecurityEventBadAdminPassword, "invalid admin portal password")
	}

	writeJSON(w, http.StatusOK, models.VerifyAdminResponse{Valid: valid})
}

// Package handlers contains HTTP request handlers for the Songify API.
// Each handler file corresponds to a specific resource or feature area.
package handlers

import (
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/songify/backend/internal/config"
	"github.com/songify/backend/internal/logging"
	"github.com/songify/backend/internal/models"
	"golang.org/x/crypto/scrypt"
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
	expectedHash := hashWithScrypt(h.cfg.AdminPortalPassword, utcDay)

	valid := req.PasswordHash == expectedHash

	if !valid {
		logging.LogSecurityEvent(r.Context(), logging.SecurityEventBadAdminPassword, "invalid admin portal password")
	}

	writeJSON(w, http.StatusOK, models.VerifyAdminResponse{Valid: valid})
}

// hashWithScrypt hashes a password using scrypt with the given salt
// Parameters match the frontend: N=16384, r=8, p=1, keyLen=32
func hashWithScrypt(password, salt string) string {
	saltBytes := []byte(strings.ToLower(salt))
	// N=16384 (2^14), r=8, p=1, keyLen=32
	dk, err := scrypt.Key([]byte(password), saltBytes, 16384, 8, 1, 32)
	if err != nil {
		return ""
	}
	return hex.EncodeToString(dk)
}

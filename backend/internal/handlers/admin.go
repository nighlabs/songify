package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/songify/backend/internal/config"
	"github.com/songify/backend/internal/models"
)

type AdminHandler struct {
	cfg *config.Config
}

func NewAdminHandler(cfg *config.Config) *AdminHandler {
	return &AdminHandler{cfg: cfg}
}

func (h *AdminHandler) VerifyPassword(w http.ResponseWriter, r *http.Request) {
	var req models.VerifyAdminRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	valid := req.Password == h.cfg.AdminPortalPassword

	writeJSON(w, http.StatusOK, models.VerifyAdminResponse{Valid: valid})
}

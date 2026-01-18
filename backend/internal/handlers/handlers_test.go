package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/songify/backend/internal/config"
	"github.com/songify/backend/internal/models"
)

func TestAdminHandler_VerifyPassword(t *testing.T) {
	cfg := &config.Config{
		AdminPortalPassword: "test-password",
	}
	handler := NewAdminHandler(cfg)

	// Get the current UTC day for salt
	utcDay := strconv.Itoa(time.Now().UTC().Day())

	// Generate the correct hash for the test password
	correctHash := hashWithScrypt("test-password", utcDay)
	wrongHash := hashWithScrypt("wrong-password", utcDay)

	tests := []struct {
		name           string
		passwordHash   string
		expectedValid  bool
		expectedStatus int
	}{
		{"correct password hash", correctHash, true, http.StatusOK},
		{"wrong password hash", wrongHash, false, http.StatusOK},
		{"empty hash", "", false, http.StatusOK},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			body, _ := json.Marshal(models.VerifyAdminRequest{PasswordHash: tt.passwordHash})
			req := httptest.NewRequest(http.MethodPost, "/api/admin/verify", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			rec := httptest.NewRecorder()

			handler.VerifyPassword(rec, req)

			if rec.Code != tt.expectedStatus {
				t.Errorf("Status = %d, want %d", rec.Code, tt.expectedStatus)
			}

			var resp models.VerifyAdminResponse
			if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
				t.Fatalf("Failed to decode response: %v", err)
			}

			if resp.Valid != tt.expectedValid {
				t.Errorf("Valid = %v, want %v", resp.Valid, tt.expectedValid)
			}
		})
	}
}

func TestAdminHandler_VerifyPassword_InvalidJSON(t *testing.T) {
	cfg := &config.Config{AdminPortalPassword: "test"}
	handler := NewAdminHandler(cfg)

	req := httptest.NewRequest(http.MethodPost, "/api/admin/verify", bytes.NewReader([]byte("invalid json")))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	handler.VerifyPassword(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("Status = %d, want %d", rec.Code, http.StatusBadRequest)
	}
}

func TestContainsIgnoreCase(t *testing.T) {
	tests := []struct {
		s      string
		substr string
		want   bool
	}{
		{"Hello World", "world", true},
		{"Hello World", "HELLO", true},
		{"Hello World", "foo", false},
		{"", "test", false},
		{"test", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.s+"_"+tt.substr, func(t *testing.T) {
			if got := containsIgnoreCase(tt.s, tt.substr); got != tt.want {
				t.Errorf("containsIgnoreCase(%q, %q) = %v, want %v", tt.s, tt.substr, got, tt.want)
			}
		})
	}
}

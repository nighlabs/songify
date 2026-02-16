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
	"github.com/songify/backend/internal/crypto"
	"github.com/songify/backend/internal/models"
	"github.com/songify/backend/internal/services"
)

func TestAdminHandler_VerifyPassword(t *testing.T) {
	cfg := &config.Config{
		AdminPortalPassword: "test-password",
	}
	handler := NewAdminHandler(cfg)

	// Get the current UTC day for salt
	utcDay := strconv.Itoa(time.Now().UTC().Day())

	// Generate the correct hash for the test password
	correctHash, err := crypto.HashWithScrypt("test-password", utcDay)
	if err != nil {
		t.Fatalf("Failed to hash test password: %v", err)
	}
	wrongHash, err := crypto.HashWithScrypt("wrong-password", utcDay)
	if err != nil {
		t.Fatalf("Failed to hash wrong password: %v", err)
	}

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

func TestRequireSession(t *testing.T) {
	tests := []struct {
		name      string
		claims    *services.Claims
		sessionID string
		wantErr   bool
	}{
		{"matching session", &services.Claims{SessionID: "s1", Role: services.RoleFriend}, "s1", false},
		{"admin also passes", &services.Claims{SessionID: "s1", Role: services.RoleAdmin}, "s1", false},
		{"wrong session", &services.Claims{SessionID: "s1", Role: services.RoleFriend}, "s2", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := requireSession(tt.claims, tt.sessionID)
			if (err != nil) != tt.wantErr {
				t.Errorf("requireSession() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestRequireAdmin(t *testing.T) {
	tests := []struct {
		name      string
		claims    *services.Claims
		sessionID string
		wantErr   bool
	}{
		{"admin correct session", &services.Claims{SessionID: "s1", Role: services.RoleAdmin}, "s1", false},
		{"friend same session", &services.Claims{SessionID: "s1", Role: services.RoleFriend}, "s1", true},
		{"admin wrong session", &services.Claims{SessionID: "s1", Role: services.RoleAdmin}, "s2", true},
		{"friend wrong session", &services.Claims{SessionID: "s1", Role: services.RoleFriend}, "s2", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := requireAdmin(tt.claims, tt.sessionID)
			if (err != nil) != tt.wantErr {
				t.Errorf("requireAdmin() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
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

package services

import (
	"testing"
	"time"
)

func TestAuthService_GenerateAndValidateToken(t *testing.T) {
	authService := NewAuthService("test-secret", time.Hour, 30*time.Minute)

	tests := []struct {
		name      string
		sessionID string
		role      Role
	}{
		{"admin token", "session-123", RoleAdmin},
		{"friend token", "session-456", RoleFriend},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			token, err := authService.GenerateToken(tt.sessionID, tt.role)
			if err != nil {
				t.Fatalf("GenerateToken() error = %v", err)
			}

			if token == "" {
				t.Fatal("GenerateToken() returned empty token")
			}

			claims, err := authService.ValidateToken(token)
			if err != nil {
				t.Fatalf("ValidateToken() error = %v", err)
			}

			if claims.SessionID != tt.sessionID {
				t.Errorf("SessionID = %v, want %v", claims.SessionID, tt.sessionID)
			}

			if claims.Role != tt.role {
				t.Errorf("Role = %v, want %v", claims.Role, tt.role)
			}
		})
	}
}

func TestAuthService_InvalidToken(t *testing.T) {
	authService := NewAuthService("test-secret", time.Hour, 30*time.Minute)

	_, err := authService.ValidateToken("invalid-token")
	if err == nil {
		t.Error("ValidateToken() should return error for invalid token")
	}
}

func TestAuthService_WrongSecret(t *testing.T) {
	authService1 := NewAuthService("secret-1", time.Hour, 30*time.Minute)
	authService2 := NewAuthService("secret-2", time.Hour, 30*time.Minute)

	token, _ := authService1.GenerateToken("session-123", RoleAdmin)

	_, err := authService2.ValidateToken(token)
	if err == nil {
		t.Error("ValidateToken() should return error for token signed with different secret")
	}
}

func TestAuthService_ExpiredToken(t *testing.T) {
	// Create service with very short token duration
	authService := NewAuthService("test-secret", -time.Hour, -time.Hour)

	token, _ := authService.GenerateToken("session-123", RoleAdmin)

	_, err := authService.ValidateToken(token)
	if err == nil {
		t.Error("ValidateToken() should return error for expired token")
	}
}

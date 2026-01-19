// Package services contains the core business logic for Songify.
package services

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Role represents a user's permission level within a session.
type Role string

const (
	RoleAdmin  Role = "admin"  // Full control over session settings and song approvals
	RoleFriend Role = "friend" // Can only submit and view song requests
)

// Claims represents the JWT payload for authenticated requests.
// It embeds session ID and role to authorize access to session resources.
type Claims struct {
	SessionID string `json:"sid"`
	Role      Role   `json:"role"`
	jwt.RegisteredClaims
}

// AuthService handles JWT token generation and validation for session authentication.
type AuthService struct {
	secret              []byte
	adminTokenDuration  time.Duration
	friendTokenDuration time.Duration
}

// NewAuthService creates an AuthService with the given signing secret and token durations.
func NewAuthService(secret string, adminDuration, friendDuration time.Duration) *AuthService {
	return &AuthService{
		secret:              []byte(secret),
		adminTokenDuration:  adminDuration,
		friendTokenDuration: friendDuration,
	}
}

// GenerateToken creates a signed JWT for the given session and role.
// Admin tokens have a longer expiry than friend tokens.
func (s *AuthService) GenerateToken(sessionID string, role Role) (string, error) {
	var duration time.Duration
	if role == RoleAdmin {
		duration = s.adminTokenDuration
	} else {
		duration = s.friendTokenDuration
	}

	claims := Claims{
		SessionID: sessionID,
		Role:      role,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "songify",
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(duration)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.secret)
}

// ValidateToken verifies the JWT signature and expiry, returning the claims if valid.
func (s *AuthService) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return s.secret, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("invalid token")
}

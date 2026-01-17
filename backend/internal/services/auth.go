package services

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Role string

const (
	RoleAdmin  Role = "admin"
	RoleFriend Role = "friend"
)

type Claims struct {
	SessionID string `json:"sid"`
	Role      Role   `json:"role"`
	jwt.RegisteredClaims
}

type AuthService struct {
	secret              []byte
	adminTokenDuration  time.Duration
	friendTokenDuration time.Duration
}

func NewAuthService(secret string, adminDuration, friendDuration time.Duration) *AuthService {
	return &AuthService{
		secret:              []byte(secret),
		adminTokenDuration:  adminDuration,
		friendTokenDuration: friendDuration,
	}
}

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

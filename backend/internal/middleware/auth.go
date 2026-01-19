package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/songify/backend/internal/logging"
	"github.com/songify/backend/internal/services"
)

type contextKey string

const (
	ClaimsKey contextKey = "claims"
)

func AuthMiddleware(authService *services.AuthService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				logging.LogSecurityEvent(r.Context(), logging.SecurityEventMissingAuth, "missing authorization header")
				http.Error(w, `{"error":"missing authorization header"}`, http.StatusUnauthorized)
				return
			}

			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || parts[0] != "Bearer" {
				logging.LogSecurityEvent(r.Context(), logging.SecurityEventInvalidAuthFmt, "invalid authorization header format")
				http.Error(w, `{"error":"invalid authorization header format"}`, http.StatusUnauthorized)
				return
			}

			claims, err := authService.ValidateToken(parts[1])
			if err != nil {
				logging.LogSecurityEvent(r.Context(), logging.SecurityEventInvalidJWT, "invalid or expired token")
				http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), ClaimsKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func AdminOnlyMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := r.Context().Value(ClaimsKey).(*services.Claims)
		if !ok || claims.Role != services.RoleAdmin {
			logging.LogSecurityEvent(r.Context(), logging.SecurityEventNonAdminAccess, "admin access required")
			http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func GetClaims(ctx context.Context) *services.Claims {
	claims, _ := ctx.Value(ClaimsKey).(*services.Claims)
	return claims
}

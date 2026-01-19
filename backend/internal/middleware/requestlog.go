package middleware

import (
	"net/http"

	"github.com/songify/backend/internal/logging"
	"github.com/songify/backend/internal/services"
)

// RequestContextMiddleware adds request attributes to context early in the middleware chain
func RequestContextMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attrs := &logging.RequestAttrs{
			Method: r.Method,
			Path:   r.URL.Path,
			IP:     logging.ExtractClientIP(r),
		}
		ctx := logging.WithRequestAttrs(r.Context(), attrs)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// UpdateRequestContextMiddleware updates context with auth info after AuthMiddleware runs
func UpdateRequestContextMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := GetClaims(r.Context())
		if claims != nil {
			ctx := logging.UpdateRequestAttrs(r.Context(), claims.SessionID, string(claims.Role))
			r = r.WithContext(ctx)
		}
		next.ServeHTTP(w, r)
	})
}

// RequestContextFromClaims creates request attributes from existing claims
// Used for updating context after authentication
func RequestContextFromClaims(r *http.Request, claims *services.Claims) *logging.RequestAttrs {
	attrs := logging.GetRequestAttrs(r.Context())
	if attrs == nil {
		attrs = &logging.RequestAttrs{
			Method: r.Method,
			Path:   r.URL.Path,
			IP:     logging.ExtractClientIP(r),
		}
	}
	if claims != nil {
		attrs.SessionID = claims.SessionID
		attrs.Role = string(claims.Role)
	}
	return attrs
}

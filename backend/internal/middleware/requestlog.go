package middleware

import (
	"net/http"

	"github.com/songify/backend/internal/logging"
)

// RequestContextMiddleware adds request attributes to context early in the middleware chain.
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

// UpdateRequestContextMiddleware updates context with auth info after AuthMiddleware runs.
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

// Package router configures the HTTP routes and middleware for the API.
// It wires together handlers, services, and middleware into a chi router.
package router

import (
	"net/http"

	"github.com/getsentry/sentry-go"
	sentryhttp "github.com/getsentry/sentry-go/http"
	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/songify/backend/internal/broker"
	"github.com/songify/backend/internal/config"
	"github.com/songify/backend/internal/db"
	"github.com/songify/backend/internal/handlers"
	"github.com/songify/backend/internal/middleware"
	"github.com/songify/backend/internal/services"
)

// New creates and configures the HTTP router with all routes and middleware.
// The router is organized into:
//   - Public routes: health check, config, admin verification
//   - Session routes: create, join, rejoin (unauthenticated)
//   - Protected session routes: requires JWT auth
//   - Admin-only routes: settings, patterns, request moderation
func New(cfg *config.Config, queries *db.Queries, eventBroker *broker.Broker) http.Handler {
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimiddleware.Recoverer)
	if sentry.CurrentHub().Client() != nil {
		sentryHandler := sentryhttp.New(sentryhttp.Options{Repanic: true})
		r.Use(sentryHandler.Handle)
	}
	realIPMiddleware := middleware.NewRealIPMiddleware(cfg.TrustedProxies)
	r.Use(realIPMiddleware.Handler)
	r.Use(middleware.RequestContextMiddleware)
	r.Use(middleware.CORSMiddleware(cfg.CORSAllowedOrigins))

	// Services
	authService := services.NewAuthService(cfg.JWTSecret, cfg.AdminTokenDuration, cfg.FriendTokenDuration)
	friendKeyService := services.NewFriendKeyService(queries)
	spotifyService := services.NewSpotifyService(cfg.SpotifyClientID, cfg.SpotifyClientSecret)

	// Handlers
	adminHandler := handlers.NewAdminHandler(cfg)
	configHandler := handlers.NewConfigHandler(cfg)
	sentryTunnelHandler := handlers.NewSentryTunnelHandler(cfg)
	sessionHandler := handlers.NewSessionHandler(queries, authService, friendKeyService)
	requestHandler := handlers.NewRequestHandler(queries, eventBroker)
	sseHandler := handlers.NewSSEHandler(eventBroker)
	spotifyHandler := handlers.NewSpotifyHandler(spotifyService, queries)

	// Rate limiter for search
	searchRateLimiter := middleware.NewRateLimiter(cfg.RateLimitPerMinute)

	// Routes
	r.Route("/api", func(r chi.Router) {
		// Health check
		r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"status":"ok"}`))
		})

		// Public configuration (Spotify client ID, etc.)
		r.Get("/config", configHandler.PublicConfig)

		// Sentry tunnel (proxies browser events to avoid CORS)
		r.Post("/sentry-tunnel", sentryTunnelHandler.Tunnel)

		// Admin portal verification (no auth required)
		r.Post("/admin/verify", adminHandler.VerifyPassword)

		// Session management
		r.Route("/sessions", func(r chi.Router) {
			// Create session (requires admin portal verification - done client-side)
			r.Post("/", sessionHandler.Create)

			// Join session with friend key (no auth)
			r.Post("/join", sessionHandler.Join)

			// Rejoin as admin (no auth)
			r.Post("/rejoin", sessionHandler.Rejoin)

			// SSE stream for real-time request updates (uses query param auth)
			r.With(
				middleware.QueryTokenAuthMiddleware,
				middleware.AuthMiddleware(authService),
				middleware.UpdateRequestContextMiddleware,
			).Get("/{id}/requests/stream", sseHandler.Stream)

			// Protected session routes
			r.Route("/{id}", func(r chi.Router) {
				r.Use(middleware.AuthMiddleware(authService))
				r.Use(middleware.UpdateRequestContextMiddleware)

				r.Get("/", sessionHandler.Get)
				r.Put("/spotify/playlist", spotifyHandler.UpdatePlaylist)

				// Admin-only settings routes
				r.Route("/settings", func(r chi.Router) {
					r.Use(middleware.AdminOnlyMiddleware)
					r.Put("/duration-limit", sessionHandler.UpdateDurationLimit)
				})

				// Admin-only patterns routes
				r.Route("/patterns", func(r chi.Router) {
					r.Use(middleware.AdminOnlyMiddleware)
					r.Get("/", sessionHandler.GetProhibitedPatterns)
					r.Post("/", sessionHandler.CreateProhibitedPattern)
					r.Delete("/{patternId}", sessionHandler.DeleteProhibitedPattern)
				})

				// Song requests
				r.Route("/requests", func(r chi.Router) {
					r.Get("/", requestHandler.List)
					r.Post("/", requestHandler.Submit)

					// Admin-only: archive all requests
					r.With(middleware.AdminOnlyMiddleware).Delete("/", requestHandler.ArchiveAll)

					// Admin-only actions
					r.Route("/{rid}", func(r chi.Router) {
						r.Use(middleware.AdminOnlyMiddleware)
						r.Put("/approve", requestHandler.Approve)
						r.Put("/reject", requestHandler.Reject)
					})
				})
			})
		})

		// Spotify search (rate limited)
		r.With(searchRateLimiter.Middleware).Get("/spotify/search", spotifyHandler.Search)
	})

	return r
}

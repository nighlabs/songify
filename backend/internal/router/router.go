package router

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/songify/backend/internal/config"
	"github.com/songify/backend/internal/db"
	"github.com/songify/backend/internal/handlers"
	"github.com/songify/backend/internal/middleware"
	"github.com/songify/backend/internal/services"
)

func New(cfg *config.Config, queries *db.Queries) http.Handler {
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.RealIP)
	r.Use(middleware.CORSMiddleware(cfg.CORSAllowedOrigins))

	// Services
	authService := services.NewAuthService(cfg.JWTSecret, cfg.AdminTokenDuration, cfg.FriendTokenDuration)
	friendKeyService := services.NewFriendKeyService(queries)
	spotifyService := services.NewSpotifyService(cfg.SpotifyClientID, cfg.SpotifyClientSecret)

	// Handlers
	adminHandler := handlers.NewAdminHandler(cfg)
	configHandler := handlers.NewConfigHandler(cfg)
	sessionHandler := handlers.NewSessionHandler(queries, authService, friendKeyService)
	requestHandler := handlers.NewRequestHandler(queries)
	spotifyHandler := handlers.NewSpotifyHandler(spotifyService)

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

			// Protected session routes
			r.Route("/{id}", func(r chi.Router) {
				r.Use(middleware.AuthMiddleware(authService))

				r.Get("/", sessionHandler.Get)
				r.Put("/playlist", sessionHandler.UpdatePlaylist)

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

// Package main is the entry point for the Songify backend server.
// It initializes logging, configuration, database, and starts the HTTP server.
package main

import (
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/getsentry/sentry-go"
	"github.com/songify/backend/internal/config"
	"github.com/songify/backend/internal/database"
	"github.com/songify/backend/internal/db"
	"github.com/songify/backend/internal/logging"
	"github.com/songify/backend/internal/router"
	sentryscrub "github.com/songify/backend/internal/sentry"
)

func main() {
	// Initialize structured logging (reads LOGGING_LEVEL env var)
	logging.Initialize()

	// Load configuration
	cfg := config.Load()

	// Initialize Sentry (no-op when DSN is empty)
	if cfg.SentryDSN != "" {
		err := sentry.Init(sentry.ClientOptions{
			Dsn:                    cfg.SentryDSN,
			Environment:            cfg.SentryEnvironment,
			TracesSampleRate:       0.2,
			BeforeSend:             sentryscrub.ScrubEvent,
			BeforeSendTransaction:  sentryscrub.ScrubTransaction,
		})
		if err != nil {
			slog.Error("failed to initialize Sentry", slog.String("error", err.Error()))
		} else {
			slog.Info("Sentry initialized", slog.String("environment", cfg.SentryEnvironment))
		}
		defer sentry.Flush(2 * time.Second)
	}

	// Initialize database
	sqlDB, err := database.New(cfg.DatabasePath)
	if err != nil {
		slog.Error("failed to connect to database", slog.String("error", err.Error()))
		os.Exit(1)
	}
	defer sqlDB.Close()

	// Run migrations
	if err := database.RunMigrations(sqlDB); err != nil {
		slog.Error("failed to run migrations", slog.String("error", err.Error()))
		os.Exit(1)
	}

	// Initialize queries
	queries := db.New(sqlDB)

	// Create router
	r := router.New(cfg, queries)

	// Start server
	addr := ":" + cfg.Port
	slog.Info("starting server", slog.String("addr", addr))
	slog.Info("frontend should connect to", slog.String("url", "http://localhost"+addr))

	if err := http.ListenAndServe(addr, r); err != nil {
		slog.Error("server failed", slog.String("error", err.Error()))
		os.Exit(1)
	}
}

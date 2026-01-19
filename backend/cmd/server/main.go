package main

import (
	"log/slog"
	"net/http"
	"os"

	"github.com/songify/backend/internal/config"
	"github.com/songify/backend/internal/database"
	"github.com/songify/backend/internal/db"
	"github.com/songify/backend/internal/logging"
	"github.com/songify/backend/internal/router"
)

func main() {
	// Initialize structured logging (reads LOGGING_LEVEL env var)
	logging.Initialize()

	// Load configuration
	cfg := config.Load()

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

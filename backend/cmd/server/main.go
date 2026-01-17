package main

import (
	"log"
	"net/http"

	"github.com/songify/backend/internal/config"
	"github.com/songify/backend/internal/database"
	"github.com/songify/backend/internal/db"
	"github.com/songify/backend/internal/router"
)

func main() {
	// Load configuration
	cfg := config.Load()

	// Initialize database
	sqlDB, err := database.New(cfg.DatabasePath)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer sqlDB.Close()

	// Run migrations
	if err := database.RunMigrations(sqlDB); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	// Initialize queries
	queries := db.New(sqlDB)

	// Create router
	r := router.New(cfg, queries)

	// Start server
	addr := ":" + cfg.Port
	log.Printf("Starting server on %s", addr)
	log.Printf("Frontend should connect to http://localhost%s", addr)

	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

// Package config handles loading application configuration from environment variables.
// All settings have sensible defaults for local development.
package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds all application settings loaded from environment variables.
type Config struct {
	Port                  string
	DatabasePath          string
	JWTSecret             string
	AdminPortalPassword   string
	SpotifyClientID       string
	SpotifyClientSecret   string
	AdminTokenDuration    time.Duration
	FriendTokenDuration   time.Duration
	RateLimitPerMinute    int
	CORSAllowedOrigins    []string
	TrustedProxies        []string
	SentryDSN             string
	SentryDSNFrontend     string
	SentryEnvironment     string
}

// Load reads configuration from environment variables, using defaults where not set.
func Load() *Config {
	return &Config{
		Port:                  getEnv("PORT", "8080"),
		DatabasePath:          getEnv("DATABASE_PATH", "./songify.db"),
		JWTSecret:             getEnv("JWT_SECRET", "change-me-in-production"),  // #nosec G101 -- intentional dev default
		AdminPortalPassword:   getEnv("ADMIN_PORTAL_PASSWORD", "admin123"),     // #nosec G101 -- intentional dev default
		SpotifyClientID:       getEnv("SPOTIFY_CLIENT_ID", ""),
		SpotifyClientSecret:   getEnv("SPOTIFY_CLIENT_SECRET", ""),
		AdminTokenDuration:    getDurationEnv("ADMIN_TOKEN_DURATION", 7*24*time.Hour),
		FriendTokenDuration:   getDurationEnv("FRIEND_TOKEN_DURATION", 12*time.Hour),
		RateLimitPerMinute:    getIntEnv("RATE_LIMIT_PER_MINUTE", 10),
		CORSAllowedOrigins:    []string{"http://localhost:5173", "http://localhost:3000"},
		TrustedProxies:        getStringSliceEnv("TRUSTED_PROXIES"),
		SentryDSN:             getEnv("SENTRY_DSN", ""),
		SentryDSNFrontend:     getEnv("SENTRY_DSN_FRONTEND", ""),
		SentryEnvironment:     getEnv("SENTRY_ENVIRONMENT", "production"),
	}
}

func getStringSliceEnv(key string) []string {
	value := os.Getenv(key)
	if value == "" {
		return nil
	}
	var result []string
	for _, s := range strings.Split(value, ",") {
		s = strings.TrimSpace(s)
		if s != "" {
			result = append(result, s)
		}
	}
	return result
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getIntEnv(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}

func getDurationEnv(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			return duration
		}
	}
	return defaultValue
}

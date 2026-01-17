package config

import (
	"os"
	"strconv"
	"time"
)

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
}

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
	}
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

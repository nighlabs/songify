package handlers

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/songify/backend/internal/logging"
	"github.com/songify/backend/internal/models"
)

// writeJSON serializes data as JSON and writes it to the response.
func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

// writeError writes an error response. If no context/error provided, just writes the response.
// For simple client errors (400-level), use: writeError(w, status, msg)
// For server errors with cause, use: writeErrorWithCause(ctx, w, status, msg, err)
func writeError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(models.ErrorResponse{Error: message})
}

// writeErrorWithCause writes an error response and logs the error with stack trace.
// Use this for server errors (500-level) where you have an underlying error to log.
func writeErrorWithCause(ctx context.Context, w http.ResponseWriter, status int, message string, err error) {
	writeError(w, status, message)

	// Don't log 401/403 - handled by security event logging
	if status == http.StatusUnauthorized || status == http.StatusForbidden {
		return
	}

	if status >= 400 && err != nil {
		wrappedErr := logging.WrapError(err, message)
		logging.LogErrorWithStatus(ctx, status, "error response", wrappedErr)
	}
}

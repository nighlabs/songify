package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/getsentry/sentry-go"
	"github.com/songify/backend/internal/logging"
	"github.com/songify/backend/internal/models"
	"github.com/songify/backend/internal/services"
)

var errForbidden = errors.New("forbidden")

// requireSession returns an error if the claims do not belong to the given session.
func requireSession(claims *services.Claims, sessionID string) error {
	if claims.SessionID != sessionID {
		return errForbidden
	}
	return nil
}

// requireAdmin returns an error if the claims do not belong to an admin of the given session.
func requireAdmin(claims *services.Claims, sessionID string) error {
	if claims.SessionID != sessionID || claims.Role != services.RoleAdmin {
		return errForbidden
	}
	return nil
}

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

		if hub := sentry.GetHubFromContext(ctx); hub != nil {
			hub.CaptureException(wrappedErr)
		} else {
			sentry.CaptureException(wrappedErr)
		}
	}
}

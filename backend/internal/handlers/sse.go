package handlers

import (
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/songify/backend/internal/broker"
	"github.com/songify/backend/internal/middleware"
)

// SSEHandler serves Server-Sent Events streams for real-time request updates.
type SSEHandler struct {
	broker *broker.Broker
}

// NewSSEHandler creates an SSEHandler backed by the given broker.
func NewSSEHandler(b *broker.Broker) *SSEHandler {
	return &SSEHandler{broker: b}
}

// Stream opens an SSE connection scoped to a session. It sends an initial
// "connected" event, then pushes "requests_changed" each time the broker
// signals for this session. A heartbeat comment is sent every 30 seconds
// to keep the connection alive through proxies.
func (h *SSEHandler) Stream(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")
	claims := middleware.GetClaims(r.Context())

	if claims.SessionID != sessionID {
		writeError(w, http.StatusForbidden, "access denied")
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming not supported")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	ch := h.broker.Subscribe(sessionID)
	defer h.broker.Unsubscribe(sessionID, ch)

	// Send initial connected event
	fmt.Fprintf(w, "event: connected\ndata: ok\n\n")
	flusher.Flush()

	heartbeat := time.NewTicker(30 * time.Second)
	defer heartbeat.Stop()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ch:
			fmt.Fprintf(w, "event: requests_changed\ndata: refresh\n\n")
			flusher.Flush()
		case <-heartbeat.C:
			fmt.Fprintf(w, ": heartbeat\n\n")
			flusher.Flush()
		}
	}
}

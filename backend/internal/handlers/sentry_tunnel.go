package handlers

import (
	"bufio"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"

	"github.com/songify/backend/internal/config"
)

// SentryTunnelHandler proxies Sentry envelopes from the browser through the
// backend, avoiding CORS issues with Sentry's ingest endpoint.
type SentryTunnelHandler struct {
	cfg    *config.Config
	client *http.Client
}

// NewSentryTunnelHandler creates a SentryTunnelHandler with the given configuration.
func NewSentryTunnelHandler(cfg *config.Config) *SentryTunnelHandler {
	return &SentryTunnelHandler{cfg: cfg, client: &http.Client{}}
}

// Tunnel reads a Sentry envelope from the request body, validates the DSN
// matches the configured frontend DSN, and forwards it to Sentry's ingest API.
func (h *SentryTunnelHandler) Tunnel(w http.ResponseWriter, r *http.Request) {
	if h.cfg.SentryDSNFrontend == "" {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1 MB limit
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	// The first line of a Sentry envelope is a JSON header containing the DSN
	scanner := bufio.NewScanner(strings.NewReader(string(body)))
	if !scanner.Scan() {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	var header struct {
		DSN string `json:"dsn"`
	}
	if err := json.Unmarshal(scanner.Bytes(), &header); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	// Validate the DSN matches the configured frontend DSN
	if header.DSN != h.cfg.SentryDSNFrontend {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	// Parse the DSN to build the ingest URL
	dsnURL, err := url.Parse(header.DSN)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	// DSN format: https://<key>@<host>/<project_id>
	projectID := strings.TrimPrefix(dsnURL.Path, "/")
	ingestURL := "https://" + dsnURL.Host + "/api/" + projectID + "/envelope/"

	req, err := http.NewRequestWithContext(r.Context(), http.MethodPost, ingestURL, strings.NewReader(string(body)))
	if err != nil {
		slog.Error("failed to create sentry tunnel request", slog.String("error", err.Error()))
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	req.Header.Set("Content-Type", "application/x-sentry-envelope")

	resp, err := h.client.Do(req)
	if err != nil {
		slog.Error("failed to forward sentry envelope", slog.String("error", err.Error()))
		w.WriteHeader(http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.WriteHeader(resp.StatusCode)
}

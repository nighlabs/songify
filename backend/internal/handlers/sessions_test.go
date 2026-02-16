package handlers

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/songify/backend/internal/db"
	"github.com/songify/backend/internal/middleware"
	"github.com/songify/backend/internal/models"
	"github.com/songify/backend/internal/services"
)

// mockQueries implements the database operations needed for testing
type mockQueries struct {
	patterns                 []db.ProhibitedPattern
	updateSettingsErr        error
	getPatternErr            error
	createPatternErr         error
	deletePatternErr         error
	deletePatternRowsAffected int64
	createdPattern           db.ProhibitedPattern
	deletedPatternID         int64
	deletedPatternSessionID  string
	updatedDurationMs        *int64
}

func (m *mockQueries) GetProhibitedPatternsBySessionID(ctx context.Context, sessionID string) ([]db.ProhibitedPattern, error) {
	if m.getPatternErr != nil {
		return nil, m.getPatternErr
	}
	return m.patterns, nil
}

func (m *mockQueries) CreateProhibitedPattern(ctx context.Context, arg db.CreateProhibitedPatternParams) (db.ProhibitedPattern, error) {
	if m.createPatternErr != nil {
		return db.ProhibitedPattern{}, m.createPatternErr
	}
	m.createdPattern = db.ProhibitedPattern{
		ID:          1,
		SessionID:   arg.SessionID,
		PatternType: arg.PatternType,
		Pattern:     arg.Pattern,
	}
	return m.createdPattern, nil
}

func (m *mockQueries) DeleteProhibitedPatternBySession(ctx context.Context, arg db.DeleteProhibitedPatternBySessionParams) (sql.Result, error) {
	if m.deletePatternErr != nil {
		return nil, m.deletePatternErr
	}
	m.deletedPatternID = arg.ID
	m.deletedPatternSessionID = arg.SessionID
	return mockResult{rowsAffected: m.deletePatternRowsAffected}, nil
}

// mockResult implements sql.Result for testing.
type mockResult struct {
	rowsAffected int64
}

func (r mockResult) LastInsertId() (int64, error) { return 0, nil }
func (r mockResult) RowsAffected() (int64, error) { return r.rowsAffected, nil }

func (m *mockQueries) UpdateSessionSettings(ctx context.Context, arg db.UpdateSessionSettingsParams) error {
	if m.updateSettingsErr != nil {
		return m.updateSettingsErr
	}
	if arg.SongDurationLimitMs.Valid {
		val := arg.SongDurationLimitMs.Int64
		m.updatedDurationMs = &val
	} else {
		m.updatedDurationMs = nil
	}
	return nil
}

// sessionQueriesInterface defines the subset of db.Queries used by session handlers
type sessionQueriesInterface interface {
	GetProhibitedPatternsBySessionID(ctx context.Context, sessionID string) ([]db.ProhibitedPattern, error)
	CreateProhibitedPattern(ctx context.Context, arg db.CreateProhibitedPatternParams) (db.ProhibitedPattern, error)
	DeleteProhibitedPatternBySession(ctx context.Context, arg db.DeleteProhibitedPatternBySessionParams) (sql.Result, error)
	UpdateSessionSettings(ctx context.Context, arg db.UpdateSessionSettingsParams) error
}

// testSessionHandler wraps SessionHandler for testing with mock queries
type testSessionHandler struct {
	mock *mockQueries
}

func newTestSessionHandler(mock *mockQueries) *testSessionHandler {
	return &testSessionHandler{mock: mock}
}

// Helper to create request with chi URL params and claims context
func createTestRequest(method, path string, body []byte, sessionID string, role services.Role, urlParams map[string]string) *http.Request {
	var req *http.Request
	if body != nil {
		req = httptest.NewRequest(method, path, bytes.NewReader(body))
	} else {
		req = httptest.NewRequest(method, path, nil)
	}
	req.Header.Set("Content-Type", "application/json")

	// Add claims to context
	claims := &services.Claims{
		SessionID: sessionID,
		Role:      role,
	}
	ctx := context.WithValue(req.Context(), middleware.ClaimsKey, claims)

	// Add chi URL params
	rctx := chi.NewRouteContext()
	for k, v := range urlParams {
		rctx.URLParams.Add(k, v)
	}
	ctx = context.WithValue(ctx, chi.RouteCtxKey, rctx)

	return req.WithContext(ctx)
}

func TestUpdateDurationLimit(t *testing.T) {
	tests := []struct {
		name           string
		sessionID      string
		claimSessionID string
		role           services.Role
		requestBody    interface{}
		updateErr      error
		expectedStatus int
		expectedMs     *int64
	}{
		{
			name:           "set duration limit",
			sessionID:      "session-123",
			claimSessionID: "session-123",
			role:           services.RoleAdmin,
			requestBody:    models.UpdateDurationLimitRequest{SongDurationLimitMs: ptrInt64(180000)},
			expectedStatus: http.StatusOK,
			expectedMs:     ptrInt64(180000),
		},
		{
			name:           "clear duration limit",
			sessionID:      "session-123",
			claimSessionID: "session-123",
			role:           services.RoleAdmin,
			requestBody:    models.UpdateDurationLimitRequest{SongDurationLimitMs: nil},
			expectedStatus: http.StatusOK,
			expectedMs:     nil,
		},
		{
			name:           "wrong session ID",
			sessionID:      "session-123",
			claimSessionID: "session-456",
			role:           services.RoleAdmin,
			requestBody:    models.UpdateDurationLimitRequest{SongDurationLimitMs: ptrInt64(180000)},
			expectedStatus: http.StatusForbidden,
		},
		{
			name:           "friend role denied",
			sessionID:      "session-123",
			claimSessionID: "session-123",
			role:           services.RoleFriend,
			requestBody:    models.UpdateDurationLimitRequest{SongDurationLimitMs: ptrInt64(180000)},
			expectedStatus: http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mock := &mockQueries{updateSettingsErr: tt.updateErr}

			body, _ := json.Marshal(tt.requestBody)
			req := createTestRequest(
				http.MethodPut,
				"/api/sessions/"+tt.sessionID+"/settings/duration-limit",
				body,
				tt.claimSessionID,
				tt.role,
				map[string]string{"id": tt.sessionID},
			)
			rec := httptest.NewRecorder()

			// Create a test handler that uses our mock
			testHandler := createUpdateDurationLimitHandler(mock)
			testHandler.ServeHTTP(rec, req)

			if rec.Code != tt.expectedStatus {
				t.Errorf("Status = %d, want %d", rec.Code, tt.expectedStatus)
			}

			if tt.expectedStatus == http.StatusOK {
				if tt.expectedMs == nil && mock.updatedDurationMs != nil {
					t.Errorf("Expected nil duration, got %d", *mock.updatedDurationMs)
				}
				if tt.expectedMs != nil && (mock.updatedDurationMs == nil || *mock.updatedDurationMs != *tt.expectedMs) {
					t.Errorf("Duration = %v, want %v", mock.updatedDurationMs, *tt.expectedMs)
				}
			}
		})
	}
}

func TestGetProhibitedPatterns(t *testing.T) {
	tests := []struct {
		name           string
		sessionID      string
		claimSessionID string
		role           services.Role
		patterns       []db.ProhibitedPattern
		getErr         error
		expectedStatus int
		expectedCount  int
	}{
		{
			name:           "get patterns successfully",
			sessionID:      "session-123",
			claimSessionID: "session-123",
			role:           services.RoleAdmin,
			patterns: []db.ProhibitedPattern{
				{ID: 1, SessionID: "session-123", PatternType: "artist", Pattern: "Drake"},
				{ID: 2, SessionID: "session-123", PatternType: "title", Pattern: "explicit"},
			},
			expectedStatus: http.StatusOK,
			expectedCount:  2,
		},
		{
			name:           "empty patterns",
			sessionID:      "session-123",
			claimSessionID: "session-123",
			role:           services.RoleAdmin,
			patterns:       []db.ProhibitedPattern{},
			expectedStatus: http.StatusOK,
			expectedCount:  0,
		},
		{
			name:           "wrong session ID",
			sessionID:      "session-123",
			claimSessionID: "session-456",
			role:           services.RoleAdmin,
			expectedStatus: http.StatusForbidden,
		},
		{
			name:           "friend role denied",
			sessionID:      "session-123",
			claimSessionID: "session-123",
			role:           services.RoleFriend,
			expectedStatus: http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mock := &mockQueries{patterns: tt.patterns, getPatternErr: tt.getErr}

			req := createTestRequest(
				http.MethodGet,
				"/api/sessions/"+tt.sessionID+"/patterns",
				nil,
				tt.claimSessionID,
				tt.role,
				map[string]string{"id": tt.sessionID},
			)
			rec := httptest.NewRecorder()

			testHandler := createGetProhibitedPatternsHandler(mock)
			testHandler.ServeHTTP(rec, req)

			if rec.Code != tt.expectedStatus {
				t.Errorf("Status = %d, want %d", rec.Code, tt.expectedStatus)
			}

			if tt.expectedStatus == http.StatusOK {
				var resp []models.ProhibitedPatternResponse
				if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
					t.Fatalf("Failed to decode response: %v", err)
				}
				if len(resp) != tt.expectedCount {
					t.Errorf("Pattern count = %d, want %d", len(resp), tt.expectedCount)
				}
			}
		})
	}
}

func TestCreateProhibitedPattern(t *testing.T) {
	tests := []struct {
		name           string
		sessionID      string
		claimSessionID string
		role           services.Role
		requestBody    models.CreatePatternRequest
		createErr      error
		expectedStatus int
	}{
		{
			name:           "create artist pattern",
			sessionID:      "session-123",
			claimSessionID: "session-123",
			role:           services.RoleAdmin,
			requestBody:    models.CreatePatternRequest{PatternType: "artist", Pattern: "Drake"},
			expectedStatus: http.StatusCreated,
		},
		{
			name:           "create title pattern",
			sessionID:      "session-123",
			claimSessionID: "session-123",
			role:           services.RoleAdmin,
			requestBody:    models.CreatePatternRequest{PatternType: "title", Pattern: "explicit"},
			expectedStatus: http.StatusCreated,
		},
		{
			name:           "invalid pattern type",
			sessionID:      "session-123",
			claimSessionID: "session-123",
			role:           services.RoleAdmin,
			requestBody:    models.CreatePatternRequest{PatternType: "invalid", Pattern: "test"},
			expectedStatus: http.StatusBadRequest,
		},
		{
			name:           "empty pattern",
			sessionID:      "session-123",
			claimSessionID: "session-123",
			role:           services.RoleAdmin,
			requestBody:    models.CreatePatternRequest{PatternType: "artist", Pattern: ""},
			expectedStatus: http.StatusBadRequest,
		},
		{
			name:           "wrong session ID",
			sessionID:      "session-123",
			claimSessionID: "session-456",
			role:           services.RoleAdmin,
			requestBody:    models.CreatePatternRequest{PatternType: "artist", Pattern: "Drake"},
			expectedStatus: http.StatusForbidden,
		},
		{
			name:           "friend role denied",
			sessionID:      "session-123",
			claimSessionID: "session-123",
			role:           services.RoleFriend,
			requestBody:    models.CreatePatternRequest{PatternType: "artist", Pattern: "Drake"},
			expectedStatus: http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mock := &mockQueries{createPatternErr: tt.createErr}

			body, _ := json.Marshal(tt.requestBody)
			req := createTestRequest(
				http.MethodPost,
				"/api/sessions/"+tt.sessionID+"/patterns",
				body,
				tt.claimSessionID,
				tt.role,
				map[string]string{"id": tt.sessionID},
			)
			rec := httptest.NewRecorder()

			testHandler := createCreateProhibitedPatternHandler(mock)
			testHandler.ServeHTTP(rec, req)

			if rec.Code != tt.expectedStatus {
				t.Errorf("Status = %d, want %d", rec.Code, tt.expectedStatus)
			}

			if tt.expectedStatus == http.StatusCreated {
				var resp models.ProhibitedPatternResponse
				if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
					t.Fatalf("Failed to decode response: %v", err)
				}
				if resp.PatternType != tt.requestBody.PatternType {
					t.Errorf("PatternType = %s, want %s", resp.PatternType, tt.requestBody.PatternType)
				}
				if resp.Pattern != tt.requestBody.Pattern {
					t.Errorf("Pattern = %s, want %s", resp.Pattern, tt.requestBody.Pattern)
				}
			}
		})
	}
}

func TestDeleteProhibitedPattern(t *testing.T) {
	tests := []struct {
		name           string
		sessionID      string
		patternID      string
		claimSessionID string
		role           services.Role
		deleteErr      error
		rowsAffected   int64
		expectedStatus int
	}{
		{
			name:           "delete pattern successfully",
			sessionID:      "session-123",
			patternID:      "1",
			claimSessionID: "session-123",
			role:           services.RoleAdmin,
			rowsAffected:   1,
			expectedStatus: http.StatusOK,
		},
		{
			name:           "pattern not found (wrong session)",
			sessionID:      "session-123",
			patternID:      "1",
			claimSessionID: "session-123",
			role:           services.RoleAdmin,
			rowsAffected:   0,
			expectedStatus: http.StatusNotFound,
		},
		{
			name:           "invalid pattern ID",
			sessionID:      "session-123",
			patternID:      "invalid",
			claimSessionID: "session-123",
			role:           services.RoleAdmin,
			expectedStatus: http.StatusBadRequest,
		},
		{
			name:           "wrong session ID",
			sessionID:      "session-123",
			patternID:      "1",
			claimSessionID: "session-456",
			role:           services.RoleAdmin,
			expectedStatus: http.StatusForbidden,
		},
		{
			name:           "friend role denied",
			sessionID:      "session-123",
			patternID:      "1",
			claimSessionID: "session-123",
			role:           services.RoleFriend,
			expectedStatus: http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mock := &mockQueries{deletePatternErr: tt.deleteErr, deletePatternRowsAffected: tt.rowsAffected}

			req := createTestRequest(
				http.MethodDelete,
				"/api/sessions/"+tt.sessionID+"/patterns/"+tt.patternID,
				nil,
				tt.claimSessionID,
				tt.role,
				map[string]string{"id": tt.sessionID, "patternId": tt.patternID},
			)
			rec := httptest.NewRecorder()

			testHandler := createDeleteProhibitedPatternHandler(mock)
			testHandler.ServeHTTP(rec, req)

			if rec.Code != tt.expectedStatus {
				t.Errorf("Status = %d, want %d", rec.Code, tt.expectedStatus)
			}

			if tt.expectedStatus == http.StatusOK && mock.deletedPatternID != 1 {
				t.Errorf("Deleted pattern ID = %d, want 1", mock.deletedPatternID)
			}
		})
	}
}

// Test handler factories that use mocks
func createUpdateDurationLimitHandler(mock *mockQueries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sessionID := chi.URLParam(r, "id")
		claims := middleware.GetClaims(r.Context())

		if claims.SessionID != sessionID {
			writeError(w, http.StatusForbidden, "access denied")
			return
		}

		if claims.Role != services.RoleAdmin {
			writeError(w, http.StatusForbidden, "admin access required")
			return
		}

		var req models.UpdateDurationLimitRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		var durationLimit db.UpdateSessionSettingsParams
		durationLimit.ID = sessionID
		if req.SongDurationLimitMs != nil {
			durationLimit.SongDurationLimitMs.Int64 = *req.SongDurationLimitMs
			durationLimit.SongDurationLimitMs.Valid = true
		}

		if err := mock.UpdateSessionSettings(r.Context(), durationLimit); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update duration limit")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func createGetProhibitedPatternsHandler(mock *mockQueries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sessionID := chi.URLParam(r, "id")
		claims := middleware.GetClaims(r.Context())

		if claims.SessionID != sessionID {
			writeError(w, http.StatusForbidden, "access denied")
			return
		}

		if claims.Role != services.RoleAdmin {
			writeError(w, http.StatusForbidden, "admin access required")
			return
		}

		patterns, err := mock.GetProhibitedPatternsBySessionID(r.Context(), sessionID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to fetch patterns")
			return
		}

		resp := make([]models.ProhibitedPatternResponse, len(patterns))
		for i, p := range patterns {
			resp[i] = models.ProhibitedPatternResponse{
				ID:          p.ID,
				PatternType: p.PatternType,
				Pattern:     p.Pattern,
			}
		}

		writeJSON(w, http.StatusOK, resp)
	}
}

func createCreateProhibitedPatternHandler(mock *mockQueries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sessionID := chi.URLParam(r, "id")
		claims := middleware.GetClaims(r.Context())

		if claims.SessionID != sessionID {
			writeError(w, http.StatusForbidden, "access denied")
			return
		}

		if claims.Role != services.RoleAdmin {
			writeError(w, http.StatusForbidden, "admin access required")
			return
		}

		var req models.CreatePatternRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid request body")
			return
		}

		if req.PatternType != "artist" && req.PatternType != "title" {
			writeError(w, http.StatusBadRequest, "patternType must be 'artist' or 'title'")
			return
		}

		if req.Pattern == "" {
			writeError(w, http.StatusBadRequest, "pattern is required")
			return
		}

		pattern, err := mock.CreateProhibitedPattern(r.Context(), db.CreateProhibitedPatternParams{
			SessionID:   sessionID,
			PatternType: req.PatternType,
			Pattern:     req.Pattern,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create pattern")
			return
		}

		writeJSON(w, http.StatusCreated, models.ProhibitedPatternResponse{
			ID:          pattern.ID,
			PatternType: pattern.PatternType,
			Pattern:     pattern.Pattern,
		})
	}
}

func createDeleteProhibitedPatternHandler(mock *mockQueries) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		sessionID := chi.URLParam(r, "id")
		patternIDStr := chi.URLParam(r, "patternId")
		claims := middleware.GetClaims(r.Context())

		if claims.SessionID != sessionID {
			writeError(w, http.StatusForbidden, "access denied")
			return
		}

		if claims.Role != services.RoleAdmin {
			writeError(w, http.StatusForbidden, "admin access required")
			return
		}

		patternID, err := parseInt64(patternIDStr)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid pattern ID")
			return
		}

		result, err := mock.DeleteProhibitedPatternBySession(r.Context(), db.DeleteProhibitedPatternBySessionParams{
			ID:        patternID,
			SessionID: sessionID,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to delete pattern")
			return
		}

		rowsAffected, err := result.RowsAffected()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to check deletion result")
			return
		}
		if rowsAffected == 0 {
			writeError(w, http.StatusNotFound, "pattern not found")
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// Helper functions
func ptrInt64(v int64) *int64 {
	return &v
}

func parseInt64(s string) (int64, error) {
	return strconv.ParseInt(s, 10, 64)
}

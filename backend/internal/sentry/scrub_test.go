package sentry

import (
	"testing"

	"github.com/getsentry/sentry-go"
)

func TestScrubEvent_RedactsSensitiveHeaders(t *testing.T) {
	event := &sentry.Event{
		Request: &sentry.Request{
			Headers: map[string]string{
				"Authorization": "Bearer secret-token",
				"Cookie":        "session=abc123",
				"Set-Cookie":    "session=abc123; HttpOnly",
				"Content-Type":  "application/json",
			},
		},
	}

	result := ScrubEvent(event, nil)

	if result.Request.Headers["Authorization"] != "[Filtered]" {
		t.Errorf("expected Authorization to be [Filtered], got %s", result.Request.Headers["Authorization"])
	}
	if result.Request.Headers["Cookie"] != "[Filtered]" {
		t.Errorf("expected Cookie to be [Filtered], got %s", result.Request.Headers["Cookie"])
	}
	if result.Request.Headers["Set-Cookie"] != "[Filtered]" {
		t.Errorf("expected Set-Cookie to be [Filtered], got %s", result.Request.Headers["Set-Cookie"])
	}
	if result.Request.Headers["Content-Type"] != "application/json" {
		t.Errorf("expected Content-Type to be preserved, got %s", result.Request.Headers["Content-Type"])
	}
}

func TestScrubEvent_StripsRequestBody(t *testing.T) {
	event := &sentry.Event{
		Request: &sentry.Request{
			Data: `{"passwordHash":"abc123","friendKeyHash":"xyz789"}`,
		},
	}

	result := ScrubEvent(event, nil)

	if result.Request.Data != "" {
		t.Errorf("expected request body to be stripped, got %s", result.Request.Data)
	}
}

func TestScrubEvent_ScrubsSensitiveTags(t *testing.T) {
	event := &sentry.Event{
		Tags: map[string]string{
			"environment":  "production",
			"token":        "secret-value",
			"passwordHash": "hashed-password",
		},
	}

	result := ScrubEvent(event, nil)

	if result.Tags["environment"] != "production" {
		t.Errorf("expected environment tag to be preserved, got %s", result.Tags["environment"])
	}
	if result.Tags["token"] != "[Filtered]" {
		t.Errorf("expected token tag to be [Filtered], got %s", result.Tags["token"])
	}
	if result.Tags["passwordHash"] != "[Filtered]" {
		t.Errorf("expected passwordHash tag to be [Filtered], got %s", result.Tags["passwordHash"])
	}
}

func TestScrubEvent_ScrubsBreadcrumbData(t *testing.T) {
	event := &sentry.Event{
		Breadcrumbs: []*sentry.Breadcrumb{
			{
				Data: map[string]interface{}{
					"url":           "/api/sessions",
					"friendKeyHash": "secret-hash",
				},
			},
			{
				Data: map[string]interface{}{
					"method": "POST",
					"jwt":    "eyJhbGciOi...",
				},
			},
		},
	}

	result := ScrubEvent(event, nil)

	if result.Breadcrumbs[0].Data["url"] != "/api/sessions" {
		t.Errorf("expected url breadcrumb to be preserved, got %v", result.Breadcrumbs[0].Data["url"])
	}
	if result.Breadcrumbs[0].Data["friendKeyHash"] != "[Filtered]" {
		t.Errorf("expected friendKeyHash breadcrumb to be [Filtered], got %v", result.Breadcrumbs[0].Data["friendKeyHash"])
	}
	if result.Breadcrumbs[1].Data["jwt"] != "[Filtered]" {
		t.Errorf("expected jwt breadcrumb to be [Filtered], got %v", result.Breadcrumbs[1].Data["jwt"])
	}
}

func TestScrubEvent_HandlesNilRequest(t *testing.T) {
	event := &sentry.Event{
		Tags: map[string]string{"password": "secret"},
	}

	result := ScrubEvent(event, nil)

	if result.Tags["password"] != "[Filtered]" {
		t.Errorf("expected password tag to be [Filtered], got %s", result.Tags["password"])
	}
}

func TestScrubEvent_HandlesEmptyEvent(t *testing.T) {
	event := &sentry.Event{}

	result := ScrubEvent(event, nil)

	if result == nil {
		t.Error("expected non-nil event")
	}
}

func TestScrubTransaction_AppliesSameScrubbing(t *testing.T) {
	event := &sentry.Event{
		Request: &sentry.Request{
			Headers: map[string]string{
				"Authorization": "Bearer token",
			},
			Data: `{"secret":"value"}`,
		},
	}

	result := ScrubTransaction(event, nil)

	if result.Request.Headers["Authorization"] != "[Filtered]" {
		t.Errorf("expected Authorization to be [Filtered], got %s", result.Request.Headers["Authorization"])
	}
	if result.Request.Data != "" {
		t.Errorf("expected request body to be stripped, got %s", result.Request.Data)
	}
}

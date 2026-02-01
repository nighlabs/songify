// Package sentry provides data scrubbing utilities for Sentry events
// to ensure sensitive information is not transmitted to the error tracking service.
package sentry

import (
	"github.com/getsentry/sentry-go"
)

// sensitiveHeaders are HTTP headers that should be redacted from Sentry events.
var sensitiveHeaders = map[string]bool{
	"Authorization": true,
	"Cookie":        true,
	"Set-Cookie":    true,
}

// sensitiveKeys are field names that may contain sensitive data in tags or breadcrumb metadata.
var sensitiveKeys = map[string]bool{
	"password":        true,
	"passwordHash":    true,
	"token":           true,
	"secret":          true,
	"friendKeyHash":   true,
	"adminPassword":   true,
	"jwt":             true,
	"authorization":   true,
	"cookie":          true,
}

// ScrubEvent removes sensitive data from a Sentry event before it is sent.
// It redacts sensitive headers, strips request bodies, and scrubs tags.
func ScrubEvent(event *sentry.Event, hint *sentry.EventHint) *sentry.Event {
	// Scrub request data
	if event.Request != nil {
		// Redact sensitive headers
		for header := range event.Request.Headers {
			if sensitiveHeaders[header] {
				event.Request.Headers[header] = "[Filtered]"
			}
		}
		// Strip request body entirely — may contain passwordHash, friendKeyHash, etc.
		event.Request.Data = ""
	}

	// Scrub sensitive keys in tags
	for key := range event.Tags {
		if sensitiveKeys[key] {
			event.Tags[key] = "[Filtered]"
		}
	}

	// Scrub breadcrumb data
	for i := range event.Breadcrumbs {
		for key := range event.Breadcrumbs[i].Data {
			if sensitiveKeys[key] {
				event.Breadcrumbs[i].Data[key] = "[Filtered]"
			}
		}
	}

	return event
}

// ScrubTransaction applies the same scrubbing logic to transaction events.
func ScrubTransaction(event *sentry.Event, hint *sentry.EventHint) *sentry.Event {
	return ScrubEvent(event, hint)
}

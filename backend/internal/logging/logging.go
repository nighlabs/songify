package logging

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/mdobak/go-xerrors"
)

// SecurityEvent represents a security-related event type
type SecurityEvent string

const (
	SecurityEventMissingAuth      SecurityEvent = "missing_auth"
	SecurityEventInvalidAuthFmt   SecurityEvent = "invalid_auth_format"
	SecurityEventInvalidJWT       SecurityEvent = "invalid_jwt"
	SecurityEventNonAdminAccess   SecurityEvent = "non_admin_access"
	SecurityEventRateLimited      SecurityEvent = "rate_limited"
	SecurityEventBadJoinCode      SecurityEvent = "bad_join_code"
	SecurityEventBadAdminPassword SecurityEvent = "bad_admin_password"
)

// RequestAttrs holds safe request context for logging
type RequestAttrs struct {
	Method    string
	Path      string
	IP        string
	SessionID string
	Role      string
}

type contextKey string

const requestAttrsKey contextKey = "requestAttrs"

// stackFrame represents a single frame in a stack trace
type stackFrame struct {
	Func   string `json:"func"`
	Source string `json:"source"`
	Line   int    `json:"line"`
}

// Initialize sets up the global slog with JSON handler and error formatting.
// It reads the log level from the LOGGING_LEVEL environment variable.
// Valid values: debug, info, warn, error (defaults to info)
func Initialize() {
	levelStr := strings.ToLower(os.Getenv("LOGGING_LEVEL"))
	level := decodeLogLevel(levelStr)

	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level:       level,
		ReplaceAttr: replaceAttr,
	})
	slog.SetDefault(slog.New(handler))
}

// decodeLogLevel converts a string to slog.Level
func decodeLogLevel(levelStr string) slog.Level {
	switch levelStr {
	case "debug":
		return slog.LevelDebug
	case "info":
		return slog.LevelInfo
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}

// replaceAttr automatically formats errors with stack traces
func replaceAttr(_ []string, a slog.Attr) slog.Attr {
	switch a.Value.Kind() {
	case slog.KindAny:
		switch v := a.Value.Any().(type) {
		case error:
			a.Value = fmtErr(v)
		}
	}
	return a
}

// marshalStack extracts stack frames from the error
func marshalStack(err error) []stackFrame {
	trace := xerrors.StackTrace(err)
	if len(trace) == 0 {
		return nil
	}

	frames := trace.Frames()
	s := make([]stackFrame, len(frames))

	for i, v := range frames {
		s[i] = stackFrame{
			Source: filepath.Join(
				filepath.Base(filepath.Dir(v.File)),
				filepath.Base(v.File),
			),
			Func: filepath.Base(v.Function),
			Line: v.Line,
		}
	}

	return s
}

// fmtErr returns a slog.Value with keys `msg` and `trace`
func fmtErr(err error) slog.Value {
	var groupValues []slog.Attr

	groupValues = append(groupValues, slog.String("msg", err.Error()))

	frames := marshalStack(err)
	if frames != nil {
		groupValues = append(groupValues, slog.Any("trace", frames))
	}

	return slog.GroupValue(groupValues...)
}

// WrapError wraps an error with a message and captures stack trace
func WrapError(err error, msg string) error {
	if err == nil {
		return nil
	}
	// Wrap with stack trace, then create a new error with the combined message
	wrapped := xerrors.WithStackTrace(err, 1)
	return xerrors.Newf("%s: %v", msg, wrapped)
}

// WithRequestAttrs adds request attributes to context
func WithRequestAttrs(ctx context.Context, attrs *RequestAttrs) context.Context {
	return context.WithValue(ctx, requestAttrsKey, attrs)
}

// GetRequestAttrs retrieves request attributes from context
func GetRequestAttrs(ctx context.Context) *RequestAttrs {
	attrs, _ := ctx.Value(requestAttrsKey).(*RequestAttrs)
	return attrs
}

// UpdateRequestAttrs updates existing request attributes in context
func UpdateRequestAttrs(ctx context.Context, sessionID, role string) context.Context {
	attrs := GetRequestAttrs(ctx)
	if attrs == nil {
		attrs = &RequestAttrs{}
	}
	newAttrs := &RequestAttrs{
		Method:    attrs.Method,
		Path:      attrs.Path,
		IP:        attrs.IP,
		SessionID: sessionID,
		Role:      role,
	}
	return WithRequestAttrs(ctx, newAttrs)
}

// RequestFields extracts slog attrs from context
func RequestFields(ctx context.Context) []any {
	attrs := GetRequestAttrs(ctx)
	if attrs == nil {
		return nil
	}

	fields := []any{
		slog.String("method", attrs.Method),
		slog.String("path", attrs.Path),
		slog.String("ip", attrs.IP),
	}

	if attrs.SessionID != "" {
		fields = append(fields, slog.String("session_id", attrs.SessionID))
	}
	if attrs.Role != "" {
		fields = append(fields, slog.String("role", attrs.Role))
	}

	return fields
}

// ExtractClientIP safely extracts the client IP from the request
func ExtractClientIP(r *http.Request) string {
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}

	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		if idx := strings.Index(forwarded, ","); idx != -1 {
			return strings.TrimSpace(forwarded[:idx])
		}
		return strings.TrimSpace(forwarded)
	}

	ip := r.RemoteAddr
	if idx := strings.LastIndex(ip, ":"); idx != -1 {
		if strings.Count(ip, ":") > 1 {
			if bracketIdx := strings.LastIndex(ip, "]"); bracketIdx != -1 {
				ip = ip[1:bracketIdx]
			}
		} else {
			ip = ip[:idx]
		}
	}
	return ip
}

// LogSecurityEvent logs a WARN-level security event with context
func LogSecurityEvent(ctx context.Context, event SecurityEvent, msg string) {
	fields := RequestFields(ctx)
	fields = append(fields, slog.String("security_event", string(event)))
	slog.WarnContext(ctx, msg, fields...)
}

// LogErrorWithStatus logs an ERROR-level message with context, status, and error
func LogErrorWithStatus(ctx context.Context, status int, msg string, err error) {
	fields := RequestFields(ctx)
	fields = append(fields, slog.Int("status", status))
	if err != nil {
		fields = append(fields, slog.Any("error", err))
	}
	slog.ErrorContext(ctx, msg, fields...)
}

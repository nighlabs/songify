package middleware

import (
	"net"
	"net/http"
	"strings"
)

// RealIPMiddleware extracts the real client IP from trusted proxy headers.
// It only trusts X-Forwarded-For and CF-Connecting-IP headers when the request
// comes from a configured trusted proxy IP/CIDR.
type RealIPMiddleware struct {
	trustedNets []*net.IPNet
	trustedIPs  []net.IP
}

// NewRealIPMiddleware creates a new RealIPMiddleware with the given trusted proxies.
// trustedProxies can be IP addresses (e.g., "192.168.1.1") or CIDRs (e.g., "10.0.0.0/8").
func NewRealIPMiddleware(trustedProxies []string) *RealIPMiddleware {
	m := &RealIPMiddleware{}

	for _, proxy := range trustedProxies {
		proxy = strings.TrimSpace(proxy)
		if proxy == "" {
			continue
		}

		// Try parsing as CIDR first
		if strings.Contains(proxy, "/") {
			_, network, err := net.ParseCIDR(proxy)
			if err == nil {
				m.trustedNets = append(m.trustedNets, network)
				continue
			}
		}

		// Parse as single IP
		if ip := net.ParseIP(proxy); ip != nil {
			m.trustedIPs = append(m.trustedIPs, ip)
		}
	}

	return m
}

// Handler returns the middleware handler
func (m *RealIPMiddleware) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		realIP := m.extractRealIP(r)
		if realIP != "" {
			r.Header.Set("X-Real-IP", realIP)
		}
		next.ServeHTTP(w, r)
	})
}

// extractRealIP extracts the real client IP from the request.
// If the request comes from a trusted proxy, it uses CF-Connecting-IP or X-Forwarded-For.
// Otherwise, it returns the direct RemoteAddr.
func (m *RealIPMiddleware) extractRealIP(r *http.Request) string {
	remoteIP := parseRemoteAddr(r.RemoteAddr)

	// If no trusted proxies configured or request is not from a trusted proxy,
	// return the direct connection IP
	if !m.isTrustedProxy(remoteIP) {
		return remoteIP
	}

	// Request is from a trusted proxy - check forwarded headers

	// Cloudflare's header takes priority (most reliable)
	if cfIP := r.Header.Get("CF-Connecting-IP"); cfIP != "" {
		return strings.TrimSpace(cfIP)
	}

	// Fall back to X-Forwarded-For (first IP in chain is the client)
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		if idx := strings.Index(xff, ","); idx != -1 {
			return strings.TrimSpace(xff[:idx])
		}
		return strings.TrimSpace(xff)
	}

	// No forwarded headers, use remote addr
	return remoteIP
}

// isTrustedProxy checks if the given IP is in the trusted proxy list
func (m *RealIPMiddleware) isTrustedProxy(ipStr string) bool {
	if len(m.trustedNets) == 0 && len(m.trustedIPs) == 0 {
		return false
	}

	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}

	// Check against trusted CIDRs
	for _, network := range m.trustedNets {
		if network.Contains(ip) {
			return true
		}
	}

	// Check against trusted individual IPs
	for _, trustedIP := range m.trustedIPs {
		if trustedIP.Equal(ip) {
			return true
		}
	}

	return false
}

// parseRemoteAddr extracts just the IP from RemoteAddr (which may include port)
func parseRemoteAddr(remoteAddr string) string {
	// Try to parse as host:port
	host, _, err := net.SplitHostPort(remoteAddr)
	if err == nil {
		return host
	}

	// If that fails, it might just be an IP (IPv6 without port)
	if ip := net.ParseIP(remoteAddr); ip != nil {
		return remoteAddr
	}

	// Last resort: return as-is
	return remoteAddr
}

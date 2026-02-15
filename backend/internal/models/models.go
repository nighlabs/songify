// Package models defines the request and response types for the API.
// These structs are serialized to/from JSON for client communication.
package models

import "time"

// VerifyAdminRequest is sent to verify the admin portal password before
// allowing session creation. The password is hashed client-side.
type VerifyAdminRequest struct {
	PasswordHash string `json:"passwordHash"`
}

// VerifyAdminResponse indicates whether the admin portal password was correct.
type VerifyAdminResponse struct {
	Valid bool `json:"valid"`
}

// CreateSessionRequest contains all parameters needed to create a new session.
// Admins can optionally configure duration limits and prohibited patterns upfront.
type CreateSessionRequest struct {
	DisplayName        string   `json:"displayName"`
	AdminName          string   `json:"adminName"`
	AdminPasswordHash  string   `json:"adminPasswordHash"`
	MusicService       string   `json:"musicService,omitempty"`
	SpotifyPlaylistID  *string  `json:"spotifyPlaylistId,omitempty"`
	SongDurationLimitMs *int64  `json:"songDurationLimitMs,omitempty"`
	ProhibitedArtists  []string `json:"prohibitedArtists,omitempty"`
	ProhibitedTitles   []string `json:"prohibitedTitles,omitempty"`
}

// CreateSessionResponse returns the session ID, friend access key (for sharing),
// and a JWT token for the admin to use in subsequent requests.
type CreateSessionResponse struct {
	SessionID       string `json:"sessionId"`
	FriendAccessKey string `json:"friendAccessKey"`
	Token           string `json:"token"`
}

// JoinSessionRequest is sent by friends to join an existing session using the
// shared friend key (hashed client-side).
type JoinSessionRequest struct {
	FriendKeyHash string `json:"friendKeyHash"`
}

// JoinSessionResponse returns session info and a JWT token for the friend.
type JoinSessionResponse struct {
	SessionID   string `json:"sessionId"`
	DisplayName string `json:"displayName"`
	Token       string `json:"token"`
}

// RejoinSessionRequest allows an admin to reclaim their session by providing
// both the friend key hash and their admin password hash.
type RejoinSessionRequest struct {
	FriendKeyHash     string `json:"friendKeyHash"`
	AdminPasswordHash string `json:"adminPasswordHash"`
}

// RejoinSessionResponse returns full session info including the friend access key
// and a new admin JWT token.
type RejoinSessionResponse struct {
	SessionID       string `json:"sessionId"`
	DisplayName     string `json:"displayName"`
	FriendAccessKey string `json:"friendAccessKey"`
	Token           string `json:"token"`
}

// SessionResponse contains the full session state. Some fields like FriendAccessKey
// and ProhibitedPatterns are only included for admin users.
type SessionResponse struct {
	ID                  string                      `json:"id"`
	DisplayName         string                      `json:"displayName"`
	AdminName           string                      `json:"adminName"`
	MusicService        string                      `json:"musicService"`
	FriendAccessKey     string                      `json:"friendAccessKey,omitempty"`
	SpotifyPlaylistID   *string                     `json:"spotifyPlaylistId,omitempty"`
	SpotifyPlaylistName *string                     `json:"spotifyPlaylistName,omitempty"`
	SongDurationLimitMs *int64                      `json:"songDurationLimitMs,omitempty"`
	ProhibitedPatterns  []ProhibitedPatternResponse `json:"prohibitedPatterns,omitempty"`
	CreatedAt           time.Time                   `json:"createdAt"`
	IsAdmin             bool                        `json:"isAdmin"`
}

// SubmitSongRequestRequest contains the Spotify track metadata for a song request.
// All fields come from the Spotify API search results.
type SubmitSongRequestRequest struct {
	SpotifyTrackID string `json:"spotifyTrackId"`
	TrackName      string `json:"trackName"`
	ArtistNames    string `json:"artistNames"`
	AlbumName      string `json:"albumName"`
	AlbumArtURL    string `json:"albumArtUrl,omitempty"`
	DurationMS     int64  `json:"durationMs"`
	SpotifyURI     string `json:"spotifyUri"`
}

// SongRequestResponse represents a song request with its current status.
// Status is one of: "pending", "approved", "rejected".
type SongRequestResponse struct {
	ID              int64      `json:"id"`
	SpotifyTrackID  string     `json:"spotifyTrackId"`
	TrackName       string     `json:"trackName"`
	ArtistNames     string     `json:"artistNames"`
	AlbumName       string     `json:"albumName"`
	AlbumArtURL     *string    `json:"albumArtUrl,omitempty"`
	DurationMS      int64      `json:"durationMs"`
	SpotifyURI      string     `json:"spotifyUri"`
	Status          string     `json:"status"`
	RequestedAt     time.Time  `json:"requestedAt"`
	ProcessedAt     *time.Time `json:"processedAt,omitempty"`
	RejectionReason *string    `json:"rejectionReason,omitempty"`
	RequesterName   *string    `json:"requesterName,omitempty"`
}

// RejectSongRequestRequest optionally includes a reason for rejection.
type RejectSongRequestRequest struct {
	Reason string `json:"reason,omitempty"`
}

// UpdatePlaylistRequest sets the Spotify playlist for the session.
type UpdatePlaylistRequest struct {
	SpotifyPlaylistID   string `json:"spotifyPlaylistId"`
	SpotifyPlaylistName string `json:"spotifyPlaylistName"`
}

// SpotifySearchResponse wraps the track results from a Spotify search.
type SpotifySearchResponse struct {
	Tracks []SpotifyTrackResponse `json:"tracks"`
}

// SpotifyTrackResponse contains track metadata from Spotify's API,
// formatted for the frontend to display and submit as a request.
type SpotifyTrackResponse struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	URI         string   `json:"uri"`
	DurationMS  int      `json:"durationMs"`
	AlbumName   string   `json:"albumName"`
	AlbumArtURL string   `json:"albumArtUrl,omitempty"`
	Artists     []string `json:"artists"`
}

// UpdateDurationLimitRequest sets or clears the maximum song duration.
// A nil value removes the limit.
type UpdateDurationLimitRequest struct {
	SongDurationLimitMs *int64 `json:"songDurationLimitMs"` // nil to clear
}

// CreatePatternRequest adds a new prohibited pattern to block certain songs.
type CreatePatternRequest struct {
	PatternType string `json:"patternType"` // "artist" or "title"
	Pattern     string `json:"pattern"`
}

// ProhibitedPatternResponse represents a pattern that blocks song requests.
type ProhibitedPatternResponse struct {
	ID          int64  `json:"id"`
	PatternType string `json:"patternType"`
	Pattern     string `json:"pattern"`
}

// ErrorResponse is the standard error format returned by all endpoints.
type ErrorResponse struct {
	Error string `json:"error"`
}

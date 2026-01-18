package models

import "time"

// Admin portal verification
type VerifyAdminRequest struct {
	Password string `json:"password"`
}

type VerifyAdminResponse struct {
	Valid bool `json:"valid"`
}

// Session management
type CreateSessionRequest struct {
	DisplayName        string   `json:"displayName"`
	AdminName          string   `json:"adminName"`
	AdminPasswordHash  string   `json:"adminPasswordHash"`
	SpotifyPlaylistID  *string  `json:"spotifyPlaylistId,omitempty"`
	SongDurationLimitMs *int64  `json:"songDurationLimitMs,omitempty"`
	ProhibitedArtists  []string `json:"prohibitedArtists,omitempty"`
	ProhibitedTitles   []string `json:"prohibitedTitles,omitempty"`
}

type CreateSessionResponse struct {
	SessionID       string `json:"sessionId"`
	FriendAccessKey string `json:"friendAccessKey"`
	Token           string `json:"token"`
}

type JoinSessionRequest struct {
	FriendAccessKey string `json:"friendAccessKey"`
}

type JoinSessionResponse struct {
	SessionID   string `json:"sessionId"`
	DisplayName string `json:"displayName"`
	Token       string `json:"token"`
}

type RejoinSessionRequest struct {
	FriendAccessKey   string `json:"friendAccessKey"`
	AdminPasswordHash string `json:"adminPasswordHash"`
}

type RejoinSessionResponse struct {
	SessionID       string `json:"sessionId"`
	DisplayName     string `json:"displayName"`
	FriendAccessKey string `json:"friendAccessKey"`
	Token           string `json:"token"`
}

type SessionResponse struct {
	ID                  string                      `json:"id"`
	DisplayName         string                      `json:"displayName"`
	AdminName           string                      `json:"adminName"`
	FriendAccessKey     string                      `json:"friendAccessKey,omitempty"`
	SpotifyPlaylistID   *string                     `json:"spotifyPlaylistId,omitempty"`
	SpotifyPlaylistName *string                     `json:"spotifyPlaylistName,omitempty"`
	SongDurationLimitMs *int64                      `json:"songDurationLimitMs,omitempty"`
	ProhibitedPatterns  []ProhibitedPatternResponse `json:"prohibitedPatterns,omitempty"`
	CreatedAt           time.Time                   `json:"createdAt"`
	IsAdmin             bool                        `json:"isAdmin"`
}

// Song requests
type SubmitSongRequestRequest struct {
	SpotifyTrackID string `json:"spotifyTrackId"`
	TrackName      string `json:"trackName"`
	ArtistNames    string `json:"artistNames"`
	AlbumName      string `json:"albumName"`
	AlbumArtURL    string `json:"albumArtUrl,omitempty"`
	DurationMS     int64  `json:"durationMs"`
	SpotifyURI     string `json:"spotifyUri"`
}

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
}

type RejectSongRequestRequest struct {
	Reason string `json:"reason,omitempty"`
}

type UpdatePlaylistRequest struct {
	SpotifyPlaylistID   string `json:"spotifyPlaylistId"`
	SpotifyPlaylistName string `json:"spotifyPlaylistName"`
}

// Spotify search
type SpotifySearchResponse struct {
	Tracks []SpotifyTrackResponse `json:"tracks"`
}

type SpotifyTrackResponse struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	URI         string   `json:"uri"`
	DurationMS  int      `json:"durationMs"`
	AlbumName   string   `json:"albumName"`
	AlbumArtURL string   `json:"albumArtUrl,omitempty"`
	Artists     []string `json:"artists"`
}

// Settings management
type UpdateDurationLimitRequest struct {
	SongDurationLimitMs *int64 `json:"songDurationLimitMs"` // nil to clear
}

type CreatePatternRequest struct {
	PatternType string `json:"patternType"` // "artist" or "title"
	Pattern     string `json:"pattern"`
}

type ProhibitedPatternResponse struct {
	ID          int64  `json:"id"`
	PatternType string `json:"patternType"`
	Pattern     string `json:"pattern"`
}

// Error response
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
}

/**
 * Core type definitions for the Songify frontend.
 * These types mirror the backend API response structures.
 */

/**
 * A pattern used to filter out songs by artist name or title.
 * Matched as case-insensitive substrings against search results.
 */
export interface ProhibitedPattern {
  id: number
  patternType: 'artist' | 'title'
  pattern: string
}

/**
 * A collaborative playlist session where friends can request songs.
 * Admins create sessions and approve/reject song requests.
 */
export interface Session {
  id: string
  displayName: string           // Display name for the session (e.g., "Friday Night Party")
  adminName: string             // Name of the session admin/host
  musicService: 'spotify' | 'youtube'  // Which music service this session uses
  friendAccessKey?: string      // BIP39-style mnemonic for friends to join (admin only)
  spotifyPlaylistId?: string    // Linked Spotify playlist ID
  spotifyPlaylistName?: string  // Linked Spotify playlist name for display
  songDurationLimitMs?: number  // Maximum song duration in milliseconds
  prohibitedPatterns?: ProhibitedPattern[]
  createdAt: string
  isAdmin: boolean              // Whether the current user is an admin
}

/**
 * A song request submitted by a user.
 * Tracks the full lifecycle from pending -> approved/rejected.
 */
export interface SongRequest {
  id: number
  externalTrackId: string
  trackName: string
  artistNames: string           // Comma-separated list of artist names
  albumName: string
  albumArtUrl?: string
  durationMs: number
  externalUri: string           // External URI (Spotify URI or YouTube URL)
  status: 'pending' | 'approved' | 'rejected'
  requestedAt: string
  processedAt?: string
  rejectionReason?: string      // Optional reason provided when rejecting
  requesterName?: string        // Anonymous identity name of requester
}

/**
 * A video from YouTube search results.
 */
export interface YouTubeVideo {
  id: string
  title: string
  channelTitle: string
  thumbnailUrl: string
  durationMs: number
}

/**
 * A track from Spotify search results.
 * Simplified structure with only the fields we need.
 */
export interface SpotifyTrack {
  id: string
  name: string
  uri: string
  durationMs: number
  albumName: string
  albumArtUrl?: string
  artists: string[]             // Array of artist names
}

/**
 * Authentication state stored in Zustand and persisted to localStorage.
 * Contains JWT token and session context.
 */
export interface AuthState {
  token: string | null          // JWT token for API authentication
  sessionId: string | null      // Current session ID
  isAdmin: boolean              // Whether user has admin privileges
  displayName: string | null    // Session display name
  identity: string | null       // User's display identity (e.g., "Chris [PlusThree43]")
  friendAccessKey: string | null // Friend key (only set for admins)
}

/**
 * YouTube TV Lounge connection status.
 */
export interface LoungeStatus {
  status: 'connected' | 'disconnected' | 'error' | 'connecting'
  screenName?: string
  error?: string
}

// ----- API Request/Response Types -----

/** Request payload for creating a new session */
export interface CreateSessionRequest {
  displayName: string
  adminName: string
  adminPasswordHash: string             // Scrypt hash of admin password
  adminPortalPasswordHash: string       // Scrypt hash of admin portal password (server-side verification)
  musicService?: 'spotify' | 'youtube'
  spotifyPlaylistId?: string
  songDurationLimitMs?: number
  prohibitedArtists?: string[]
  prohibitedTitles?: string[]
}

/** Response when a friend joins a session using the access key */
export interface JoinSessionResponse {
  sessionId: string
  displayName: string
  identity: string              // User's display identity (e.g., "Chris [PlusThree43]")
  token: string                 // JWT token for the friend
}

/** Response when creating a new session */
export interface CreateSessionResponse {
  sessionId: string
  friendAccessKey: string       // Generated BIP39-style mnemonic
  token: string                 // JWT token for the admin
}

/** Response when an admin rejoins their session */
export interface RejoinSessionResponse {
  sessionId: string
  displayName: string
  friendAccessKey: string
  token: string
}

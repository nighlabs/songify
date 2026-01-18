export interface Session {
  id: string
  displayName: string
  adminName: string
  friendAccessKey?: string
  spotifyPlaylistId?: string
  spotifyPlaylistName?: string
  songDurationLimitMs?: number
  createdAt: string
  isAdmin: boolean
}

export interface SongRequest {
  id: number
  spotifyTrackId: string
  trackName: string
  artistNames: string
  albumName: string
  albumArtUrl?: string
  durationMs: number
  spotifyUri: string
  status: 'pending' | 'approved' | 'rejected'
  requestedAt: string
  processedAt?: string
  rejectionReason?: string
}

export interface SpotifyTrack {
  id: string
  name: string
  uri: string
  durationMs: number
  albumName: string
  albumArtUrl?: string
  artists: string[]
}

export interface AuthState {
  token: string | null
  sessionId: string | null
  isAdmin: boolean
  displayName: string | null
  friendAccessKey: string | null
}

export interface CreateSessionRequest {
  displayName: string
  adminName: string
  adminPasswordHash: string
  spotifyPlaylistId?: string
  songDurationLimitMs?: number
  prohibitedArtists?: string[]
  prohibitedTitles?: string[]
}

export interface JoinSessionResponse {
  sessionId: string
  displayName: string
  token: string
}

export interface CreateSessionResponse {
  sessionId: string
  friendAccessKey: string
  token: string
}

export interface RejoinSessionResponse {
  sessionId: string
  displayName: string
  friendAccessKey: string
  token: string
}

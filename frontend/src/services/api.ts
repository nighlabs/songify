/**
 * API client for the Songify backend.
 * All requests are automatically authenticated using the JWT from the auth store.
 */

import * as Sentry from '@sentry/react'
import type {
  Session,
  SongRequest,
  SpotifyTrack,
  YouTubeVideo,
  CreateSessionRequest,
  CreateSessionResponse,
  JoinSessionResponse,
  RejoinSessionResponse,
  ProhibitedPattern,
} from '@/types'
import { useAuthStore } from '@/stores/authStore'

const API_BASE = '/api'

/**
 * Custom error class for API errors.
 * Includes HTTP status code for error handling.
 */
class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Generic request helper that handles auth headers and error responses.
 * Automatically attaches JWT token from auth store if available.
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = useAuthStore.getState().token

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    const apiError = new ApiError(response.status, error.error || error.message || 'Request failed')

    // Report 5xx server errors to Sentry (4xx are expected app flow)
    if (response.status >= 500) {
      Sentry.captureException(apiError)
    }

    throw apiError
  }

  return response.json()
}

/**
 * API client object containing all backend endpoints.
 * Methods are grouped by feature area.
 */
export const api = {
  // ----- Admin Portal -----

  /** Verify the global admin portal password (uses time-based hash) */
  verifyAdminPassword: async (passwordHash: string): Promise<{ valid: boolean }> => {
    return request('/admin/verify', {
      method: 'POST',
      body: JSON.stringify({ passwordHash }),
    })
  },

  // ----- Sessions -----

  /** Create a new session (returns JWT and friend access key) */
  createSession: async (data: CreateSessionRequest): Promise<CreateSessionResponse> => {
    return request('/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /** Join a session as a friend using the hashed access key */
  joinSession: async (friendKeyHash: string): Promise<JoinSessionResponse> => {
    return request('/sessions/join', {
      method: 'POST',
      body: JSON.stringify({ friendKeyHash }),
    })
  },

  /** Rejoin a session as admin using access key + password */
  rejoinSession: async (friendKeyHash: string, adminPasswordHash: string): Promise<RejoinSessionResponse> => {
    return request('/sessions/rejoin', {
      method: 'POST',
      body: JSON.stringify({ friendKeyHash, adminPasswordHash }),
    })
  },

  /** Get session details (requires auth) */
  getSession: async (sessionId: string): Promise<Session> => {
    return request(`/sessions/${sessionId}`)
  },

  // ----- Song Requests -----

  /** Get all song requests for a session */
  getSongRequests: async (sessionId: string): Promise<SongRequest[]> => {
    return request(`/sessions/${sessionId}/requests`)
  },

  /** Submit a new song request from search results */
  submitSongRequest: async (
    sessionId: string,
    track: SpotifyTrack
  ): Promise<SongRequest> => {
    return request(`/sessions/${sessionId}/requests`, {
      method: 'POST',
      body: JSON.stringify({
        externalTrackId: track.id,
        trackName: track.name,
        artistNames: track.artists.join(', '),
        albumName: track.albumName,
        albumArtUrl: track.albumArtUrl,
        durationMs: track.durationMs,
        externalUri: track.uri,
      }),
    })
  },

  /** Approve a pending song request (admin only) */
  approveSongRequest: async (sessionId: string, requestId: number): Promise<SongRequest> => {
    return request(`/sessions/${sessionId}/requests/${requestId}/approve`, {
      method: 'PUT',
    })
  },

  /** Reject a pending song request with optional reason (admin only) */
  rejectSongRequest: async (
    sessionId: string,
    requestId: number,
    reason?: string
  ): Promise<SongRequest> => {
    return request(`/sessions/${sessionId}/requests/${requestId}/reject`, {
      method: 'PUT',
      body: JSON.stringify({ reason }),
    })
  },

  /** Delete all song requests in a session (admin only) */
  archiveAllRequests: async (sessionId: string): Promise<void> => {
    return request(`/sessions/${sessionId}/requests`, {
      method: 'DELETE',
    })
  },

  // ----- Spotify Integration -----

  /** Search Spotify for tracks (proxied through backend) */
  searchSpotify: async (query: string): Promise<{ tracks: SpotifyTrack[] }> => {
    return request(`/spotify/search?q=${encodeURIComponent(query)}`)
  },

  // ----- YouTube Integration -----

  /** Search YouTube for videos (proxied through backend) */
  searchYouTube: async (query: string): Promise<{ videos: YouTubeVideo[] }> => {
    return request(`/youtube/search?q=${encodeURIComponent(query)}`)
  },

  /** Submit a YouTube video as a song request */
  submitYouTubeRequest: async (
    sessionId: string,
    video: YouTubeVideo
  ): Promise<SongRequest> => {
    return request(`/sessions/${sessionId}/requests`, {
      method: 'POST',
      body: JSON.stringify({
        externalTrackId: video.id,
        trackName: video.title,
        artistNames: video.channelTitle,
        albumName: '',
        albumArtUrl: video.thumbnailUrl,
        durationMs: 0,
        externalUri: `https://www.youtube.com/watch?v=${video.id}`,
      }),
    })
  },

  /** Link a Spotify playlist to the session */
  updateSessionPlaylist: async (sessionId: string, spotifyPlaylistId: string, spotifyPlaylistName: string): Promise<void> => {
    return request(`/sessions/${sessionId}/spotify/playlist`, {
      method: 'PUT',
      body: JSON.stringify({ spotifyPlaylistId, spotifyPlaylistName }),
    })
  },

  // ----- Session Settings -----

  /** Update the song duration limit (null to remove) */
  updateDurationLimit: async (sessionId: string, limitMs: number | null): Promise<void> => {
    return request(`/sessions/${sessionId}/settings/duration-limit`, {
      method: 'PUT',
      body: JSON.stringify({ songDurationLimitMs: limitMs }),
    })
  },

  // ----- Prohibited Patterns -----

  /** Add a new prohibition pattern (blocks matching songs from search) */
  createProhibitedPattern: async (
    sessionId: string,
    patternType: 'artist' | 'title',
    pattern: string
  ): Promise<ProhibitedPattern> => {
    return request(`/sessions/${sessionId}/patterns`, {
      method: 'POST',
      body: JSON.stringify({ patternType, pattern }),
    })
  },

  /** Remove a prohibition pattern */
  deleteProhibitedPattern: async (sessionId: string, patternId: number): Promise<void> => {
    return request(`/sessions/${sessionId}/patterns/${patternId}`, {
      method: 'DELETE',
    })
  },
}

export { ApiError }

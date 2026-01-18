import type {
  Session,
  SongRequest,
  SpotifyTrack,
  CreateSessionRequest,
  CreateSessionResponse,
  JoinSessionResponse,
  RejoinSessionResponse,
} from '@/types'
import { useAuthStore } from '@/stores/authStore'

const API_BASE = '/api'

class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

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
    throw new ApiError(response.status, error.error || error.message || 'Request failed')
  }

  return response.json()
}

export const api = {
  // Admin portal
  verifyAdminPassword: async (password: string): Promise<{ valid: boolean }> => {
    return request('/admin/verify', {
      method: 'POST',
      body: JSON.stringify({ password }),
    })
  },

  // Sessions
  createSession: async (data: CreateSessionRequest): Promise<CreateSessionResponse> => {
    return request('/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  joinSession: async (friendAccessKey: string): Promise<JoinSessionResponse> => {
    return request('/sessions/join', {
      method: 'POST',
      body: JSON.stringify({ friendAccessKey }),
    })
  },

  rejoinSession: async (friendAccessKey: string, adminPasswordHash: string): Promise<RejoinSessionResponse> => {
    return request('/sessions/rejoin', {
      method: 'POST',
      body: JSON.stringify({ friendAccessKey, adminPasswordHash }),
    })
  },

  getSession: async (sessionId: string): Promise<Session> => {
    return request(`/sessions/${sessionId}`)
  },

  // Song requests
  getSongRequests: async (sessionId: string): Promise<SongRequest[]> => {
    return request(`/sessions/${sessionId}/requests`)
  },

  submitSongRequest: async (
    sessionId: string,
    track: SpotifyTrack
  ): Promise<SongRequest> => {
    return request(`/sessions/${sessionId}/requests`, {
      method: 'POST',
      body: JSON.stringify({
        spotifyTrackId: track.id,
        trackName: track.name,
        artistNames: track.artists.join(', '),
        albumName: track.albumName,
        albumArtUrl: track.albumArtUrl,
        durationMs: track.durationMs,
        spotifyUri: track.uri,
      }),
    })
  },

  approveSongRequest: async (sessionId: string, requestId: number): Promise<SongRequest> => {
    return request(`/sessions/${sessionId}/requests/${requestId}/approve`, {
      method: 'PUT',
    })
  },

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

  // Spotify
  searchSpotify: async (query: string): Promise<{ tracks: SpotifyTrack[] }> => {
    return request(`/spotify/search?q=${encodeURIComponent(query)}`)
  },

  updateSessionPlaylist: async (sessionId: string, spotifyPlaylistId: string): Promise<void> => {
    return request(`/sessions/${sessionId}/playlist`, {
      method: 'PUT',
      body: JSON.stringify({ spotifyPlaylistId }),
    })
  },
}

export { ApiError }

import { SpotifyApi } from '@spotify/web-api-ts-sdk'
import { getConfig, getCachedConfig } from './config'

const REDIRECT_URI = `${window.location.origin}/callback`
const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
]

let spotifyApi: SpotifyApi | null = null

export async function initSpotifyAuth(): Promise<SpotifyApi> {
  if (spotifyApi) {
    return spotifyApi
  }

  const config = await getConfig()

  spotifyApi = SpotifyApi.withUserAuthorization(
    config.spotifyClientId,
    REDIRECT_URI,
    SCOPES
  )

  return spotifyApi
}

export async function authenticateSpotify(): Promise<void> {
  const api = await initSpotifyAuth()
  await api.authenticate()
}

export function isSpotifyAuthenticated(): boolean {
  return spotifyApi !== null
}

// Check if there's a stored Spotify token in localStorage
export function hasStoredSpotifyToken(): boolean {
  return localStorage.getItem('spotify-sdk:AuthorizationCodeWithPKCEStrategy:token') !== null
}

// Try to restore Spotify session from stored token
// If playlistId is provided, verifies access to that specific playlist
// Returns true if session was restored and verified successfully
export async function tryRestoreSpotifySession(playlistId?: string): Promise<boolean> {
  if (spotifyApi) {
    // Already initialized, but verify token still works
    try {
      if (playlistId) {
        // Verify we can access the linked playlist
        await spotifyApi.playlists.getPlaylist(playlistId)
      } else {
        // Fallback: verify with any playlist read
        await spotifyApi.currentUser.playlists.playlists(1)
      }
      return true
    } catch {
      // Token expired, invalid, or playlist no longer accessible
      localStorage.removeItem('spotify-sdk:AuthorizationCodeWithPKCEStrategy:token')
      spotifyApi = null
      return false
    }
  }

  if (!hasStoredSpotifyToken()) {
    return false // No stored token
  }

  try {
    const api = await initSpotifyAuth()
    // The SDK's authenticate() will use the stored token if valid
    await api.authenticate()

    // Verify the token works by accessing the playlist
    if (playlistId) {
      await api.playlists.getPlaylist(playlistId)
    } else {
      await api.currentUser.playlists.playlists(1)
    }
    return true
  } catch (e) {
    console.error('Failed to restore Spotify session:', e)
    // Clear invalid token
    localStorage.removeItem('spotify-sdk:AuthorizationCodeWithPKCEStrategy:token')
    spotifyApi = null
    return false
  }
}

export async function getUserPlaylists() {
  if (!spotifyApi) {
    throw new Error('Spotify not authenticated')
  }

  const playlists = await spotifyApi.currentUser.playlists.playlists(50)
  return playlists.items
}

export async function addTrackToPlaylist(playlistId: string, trackUri: string) {
  if (!spotifyApi) {
    throw new Error('Spotify not authenticated')
  }

  await spotifyApi.playlists.addItemsToPlaylist(playlistId, [trackUri])
}

export async function getPlaylist(playlistId: string) {
  if (!spotifyApi) {
    throw new Error('Spotify not authenticated')
  }

  return spotifyApi.playlists.getPlaylist(playlistId)
}

export async function createPlaylist(name: string, description?: string) {
  if (!spotifyApi) {
    throw new Error('Spotify not authenticated')
  }

  const user = await spotifyApi.currentUser.profile()
  const playlist = await spotifyApi.playlists.createPlaylist(user.id, {
    name,
    description: description || 'Created by Songify',
    public: false,
  })
  return playlist
}

export async function handleSpotifyCallback(): Promise<void> {
  const config = getCachedConfig() || await getConfig()

  if (!spotifyApi) {
    spotifyApi = SpotifyApi.withUserAuthorization(
      config.spotifyClientId,
      REDIRECT_URI,
      SCOPES
    )
  }
  await spotifyApi.authenticate()
}

export function logoutSpotify(): void {
  spotifyApi = null
  localStorage.removeItem('spotify-sdk:AuthorizationCodeWithPKCEStrategy:token')
}

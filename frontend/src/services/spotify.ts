/**
 * Spotify Web API integration using the official SDK.
 * Handles OAuth PKCE flow and playlist operations.
 *
 * Authentication flow:
 * 1. Admin clicks "Connect Spotify" -> authenticateSpotify() redirects to Spotify
 * 2. User authorizes -> Spotify redirects to /callback with auth code
 * 3. handleSpotifyCallback() exchanges code for token (SDK handles this)
 * 4. Token is stored in localStorage by the SDK
 *
 * Token persistence:
 * - The SDK stores tokens at 'spotify-sdk:AuthorizationCodeWithPKCEStrategy:token'
 * - On page refresh, tryRestoreSpotifySession() re-initializes the SDK with stored token
 * - Token validity is verified by making an actual API call to the linked playlist
 */

import { SpotifyApi } from '@spotify/web-api-ts-sdk'
import { getConfig, getCachedConfig } from './config'

/** OAuth callback URL - must match Spotify app settings */
const REDIRECT_URI = `${window.location.origin}/callback`

/** OAuth scopes for playlist read/write access */
const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
]

/**
 * Module-level SDK instance.
 * Reset to null on page refresh, restored via tryRestoreSpotifySession().
 */
let spotifyApi: SpotifyApi | null = null

/**
 * Initialize the Spotify SDK with user authorization.
 * Creates SDK instance if not already created.
 */
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

/**
 * Start the OAuth PKCE flow.
 * Redirects user to Spotify login, then back to /callback.
 */
export async function authenticateSpotify(): Promise<void> {
  const api = await initSpotifyAuth()
  await api.authenticate()
}

/**
 * Check if the Spotify SDK is initialized with a valid session.
 * Note: This only checks if the SDK is initialized, not if the token is valid.
 * Use tryRestoreSpotifySession() for token validation.
 */
export function isSpotifyAuthenticated(): boolean {
  return spotifyApi !== null
}

/**
 * Check if there's a stored Spotify token in localStorage.
 * Used for quick check before attempting full session restore.
 */
export function hasStoredSpotifyToken(): boolean {
  return localStorage.getItem('spotify-sdk:AuthorizationCodeWithPKCEStrategy:token') !== null
}

/**
 * Attempt to restore Spotify session from stored token.
 * Validates the token by making an actual API call.
 *
 * @param playlistId - If provided, verifies access to this specific playlist
 * @returns true if session was restored and verified successfully
 */
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

/**
 * Fetch user's playlists for selection UI.
 * @returns Array of playlist objects with id, name, and images
 */
export async function getUserPlaylists() {
  if (!spotifyApi) {
    throw new Error('Spotify not authenticated')
  }

  const playlists = await spotifyApi.currentUser.playlists.playlists(50)
  return playlists.items
}

/**
 * Add an approved track to the linked playlist.
 * @param playlistId - Spotify playlist ID
 * @param trackUri - Spotify track URI (e.g., "spotify:track:...")
 */
export async function addTrackToPlaylist(playlistId: string, trackUri: string) {
  if (!spotifyApi) {
    throw new Error('Spotify not authenticated')
  }

  await spotifyApi.playlists.addItemsToPlaylist(playlistId, [trackUri])
}

/**
 * Get playlist details including name and cover image.
 * @param playlistId - Spotify playlist ID
 */
export async function getPlaylist(playlistId: string) {
  if (!spotifyApi) {
    throw new Error('Spotify not authenticated')
  }

  return spotifyApi.playlists.getPlaylist(playlistId)
}

/**
 * Create a new private playlist in the user's account.
 * @param name - Playlist name
 * @param description - Optional description
 */
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

/**
 * Handle the OAuth callback from Spotify.
 * Called on /callback page to complete the auth flow.
 */
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

/**
 * Clear Spotify session and remove stored token.
 * Used when logging out or when token is invalid.
 */
export function logoutSpotify(): void {
  spotifyApi = null
  localStorage.removeItem('spotify-sdk:AuthorizationCodeWithPKCEStrategy:token')
}

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
import { api } from './api'
import { encryptToken, decryptToken, hasTokenKey, clearTokenKey } from './crypto'

/** localStorage key the Spotify SDK uses to persist the auth token blob. */
const TOKEN_KEY = 'spotify-sdk:AuthorizationCodeWithPKCEStrategy:token'

/** Last token blob pushed to the backend, to skip redundant syncs after refreshes. */
let lastSyncedTokenBlob: string | null = null

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
  return localStorage.getItem(TOKEN_KEY) !== null
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
      localStorage.removeItem(TOKEN_KEY)
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
    localStorage.removeItem(TOKEN_KEY)
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
  localStorage.removeItem(TOKEN_KEY)
  clearTokenKey()
  lastSyncedTokenBlob = null
}

/**
 * Spotify token persistence (opt-in, admin only).
 *
 * When enabled, the admin's Spotify token blob is encrypted client-side and
 * synced to the backend so it can follow them to another device. The backend
 * only stores opaque ciphertext (see services/crypto.ts).
 */

/**
 * Push the current local Spotify token to the backend if persistence is enabled.
 * No-op when disabled, when no encryption key is available, when there is no
 * local token yet, or when the blob is unchanged since the last sync.
 */
export async function persistSpotifyTokenIfEnabled(sessionId: string, enabled: boolean): Promise<void> {
  if (!enabled || !hasTokenKey()) return

  const blob = localStorage.getItem(TOKEN_KEY)
  if (!blob || blob === lastSyncedTokenBlob) return

  const cipher = await encryptToken(blob)
  if (!cipher) return

  try {
    await api.saveSpotifyAuthToken(sessionId, true, cipher)
    lastSyncedTokenBlob = blob
  } catch (e) {
    console.error('Failed to persist Spotify token:', e)
  }
}

/**
 * Turn on persistence for this session: encrypt the current local Spotify token
 * (if the admin has connected already) and store it on the backend. When no
 * token exists yet, persistence is still enabled and the blob is synced later
 * once the admin connects Spotify.
 */
export async function enableSpotifyPersistence(sessionId: string): Promise<void> {
  const blob = localStorage.getItem(TOKEN_KEY)
  const cipher = blob ? await encryptToken(blob) : null
  await api.saveSpotifyAuthToken(sessionId, true, cipher)
  if (blob) lastSyncedTokenBlob = blob
}

/**
 * Turn off persistence and clear any stored token from the backend.
 */
export async function disableSpotifyPersistence(sessionId: string): Promise<void> {
  await api.clearSpotifyAuthToken(sessionId)
  lastSyncedTokenBlob = null
}

/**
 * Restore a persisted Spotify token from the backend into localStorage.
 * Only runs when there is no local token yet and an encryption key is available
 * (i.e. the admin just created/rejoined the session on this device).
 *
 * @returns true if a token was decrypted and written locally.
 */
export async function restoreSpotifyTokenFromBackend(sessionId: string): Promise<boolean> {
  if (hasStoredSpotifyToken() || !hasTokenKey()) return false

  try {
    const { enabled, encryptedToken } = await api.getSpotifyAuthToken(sessionId)
    if (!enabled || !encryptedToken) return false

    const blob = await decryptToken(encryptedToken)
    if (!blob) return false

    localStorage.setItem(TOKEN_KEY, blob)
    lastSyncedTokenBlob = blob
    return true
  } catch (e) {
    console.error('Failed to restore Spotify token from backend:', e)
    return false
  }
}

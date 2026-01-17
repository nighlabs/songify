import { SpotifyApi } from '@spotify/web-api-ts-sdk'

const SPOTIFY_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || ''
const REDIRECT_URI = `${window.location.origin}/callback`
const SCOPES = [
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
]

let spotifyApi: SpotifyApi | null = null

export function getSpotifyApi(): SpotifyApi | null {
  return spotifyApi
}

export async function initSpotifyAuth(): Promise<SpotifyApi> {
  if (spotifyApi) {
    return spotifyApi
  }

  spotifyApi = SpotifyApi.withUserAuthorization(
    SPOTIFY_CLIENT_ID,
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

export async function handleSpotifyCallback(): Promise<void> {
  if (!spotifyApi) {
    spotifyApi = SpotifyApi.withUserAuthorization(
      SPOTIFY_CLIENT_ID,
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

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Music,
  Loader2,
  ExternalLink,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getPlaylist } from '@/services/spotify'
import { useClickOutside } from '@/hooks/useClickOutside'

/** Cached playlist info for display */
type PlaylistInfo = {
  name: string
  imageUrl: string | null
  externalUrl: string
}

/**
 * Spotify connection status indicator in the header.
 *
 * States:
 * - No playlist linked: Green "Connect Spotify" button
 * - Playlist linked, not authenticated: Amber "Reconnect" warning
 * - Playlist linked and authenticated: Green playlist name with dropdown
 */
export function SpotifyStatus({
  playlistId,
  playlistName,
  isAuthenticated,
  onConnect,
  onChangePlaylist
}: {
  playlistId: string | null | undefined
  playlistName: string | null | undefined
  isAuthenticated: boolean
  onConnect: () => void
  onChangePlaylist: () => void
}) {
  // Compute initial playlist state from props
  const initialPlaylist: PlaylistInfo | null = playlistId ? {
    name: playlistName || 'Linked Playlist',
    imageUrl: null,
    externalUrl: `https://open.spotify.com/playlist/${playlistId}`,
  } : null

  const [playlist, setPlaylist] = useState<PlaylistInfo | null>(initialPlaylist)
  const [loading, setLoading] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch full playlist details from Spotify if authenticated (to get image)
  useEffect(() => {
    if (!playlistId || !isAuthenticated) {
      return
    }

    const controller = new AbortController()

    const fetchPlaylist = async () => {
      setLoading(true)
      try {
        const p = await getPlaylist(playlistId)
        if (!controller.signal.aborted) {
          setPlaylist({
            name: p.name,
            imageUrl: p.images?.[0]?.url || null,
            externalUrl: p.external_urls.spotify,
          })
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          console.error('Failed to fetch playlist:', e)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    fetchPlaylist()

    return () => {
      controller.abort()
    }
  }, [playlistId, isAuthenticated])

  useClickOutside(dropdownRef, useCallback(() => setDropdownOpen(false), []))

  const isConnected = isAuthenticated

  if (!playlistId) {
    return (
      <Button
        size="sm"
        onClick={onConnect}
        className="bg-green-600 hover:bg-green-700 text-white"
      >
        <Music className="h-4 w-4 mr-1" />
        Connect Spotify
      </Button>
    )
  }

  if (loading) {
    return (
      <div className="h-8 w-8 rounded bg-green-100 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-green-600" />
      </div>
    )
  }

  // Show disconnected state when playlist is linked but Spotify isn't authenticated
  if (!isConnected) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-2 px-2 py-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors"
        >
          <div className="h-7 w-7 rounded bg-amber-500 flex items-center justify-center">
            <AlertTriangle className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-medium text-amber-800 max-w-[150px] truncate">
            Reconnect
          </span>
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border py-1 z-20">
            <div className="px-3 py-2 border-b">
              <p className="text-xs text-amber-600 font-medium">Spotify Disconnected</p>
              <p className="text-sm text-muted-foreground mt-1">
                Reconnect to approve songs to "{playlist?.name}"
              </p>
            </div>
            <button
              onClick={() => {
                setDropdownOpen(false)
                onConnect()
              }}
              className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-muted transition-colors text-amber-700 font-medium"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Reconnect Spotify</span>
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-2 px-2 py-1 rounded-lg border border-green-200 bg-green-50 hover:bg-green-100 transition-colors"
      >
        {playlist?.imageUrl ? (
          <img
            src={playlist.imageUrl}
            alt={playlist.name}
            className="h-7 w-7 rounded"
          />
        ) : (
          <div className="h-7 w-7 rounded bg-green-600 flex items-center justify-center">
            <Music className="h-4 w-4 text-white" />
          </div>
        )}
        <span className="text-sm font-medium text-green-800 max-w-[150px] truncate">
          {playlist?.name}
        </span>
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border py-1 z-20">
          <div className="px-3 py-2 border-b">
            <p className="text-xs text-muted-foreground">Linked Playlist</p>
            <p className="font-medium truncate">{playlist?.name}</p>
          </div>
          <a
            href={playlist?.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors"
            onClick={() => setDropdownOpen(false)}
          >
            <ExternalLink className="h-4 w-4" />
            <span>Open in Spotify</span>
          </a>
          <button
            onClick={() => {
              setDropdownOpen(false)
              onChangePlaylist()
            }}
            className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-muted transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Change Playlist</span>
          </button>
        </div>
      )}
    </div>
  )
}

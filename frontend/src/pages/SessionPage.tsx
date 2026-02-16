/**
 * Main session page - The core UI for both admins and friends.
 *
 * Features:
 * - Song search via Spotify API
 * - Submit song requests
 * - View pending/processed requests
 * - (Admin) Approve/reject requests
 * - (Admin) Spotify playlist integration
 * - (Admin) Session settings (time limit, prohibited patterns)
 *
 * Data fetching:
 * - Session details: useQuery with cache invalidation
 * - Song requests: useQuery with 5s polling for real-time updates
 * - Mutations for submit/approve/reject with optimistic updates
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Music,
  Search,
  Check,
  X,
  Clock,
  Share2,
  LogOut,
  Loader2,
  Plus,
  ExternalLink,
  RefreshCw,
  Ban,
  AlertTriangle,
  Tv,
  Play,
  Unplug,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AdminSettings } from '@/components/AdminSettings'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import type { Session, SongRequest, SpotifyTrack, YouTubeVideo, LoungeStatus } from '@/types'
import {
  authenticateSpotify,
  isSpotifyAuthenticated,
  addTrackToPlaylist,
  getPlaylist,
  tryRestoreSpotifySession,
} from '@/services/spotify'
import { useClickOutside } from '@/hooks/useClickOutside'
import { useRequestsSSE } from '@/hooks/useRequestsSSE'
import { formatDuration } from '@/lib/utils'

/** Cached playlist info for display in SpotifyStatus */
type PlaylistInfo = {
  name: string
  imageUrl: string | null
  externalUrl: string
}

/** Visual badge showing request status (pending/approved/rejected) */
function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="warning" className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Pending
        </Badge>
      )
    case 'approved':
      return (
        <Badge variant="success" className="flex items-center gap-1">
          <Check className="h-3 w-3" />
          Approved
        </Badge>
      )
    case 'rejected':
      return (
        <Badge variant="destructive" className="flex items-center gap-1">
          <X className="h-3 w-3" />
          Rejected
        </Badge>
      )
    default:
      return null
  }
}

/**
 * Spotify connection status indicator in the header.
 *
 * States:
 * - No playlist linked: Green "Connect Spotify" button
 * - Playlist linked, not authenticated: Amber "Reconnect" warning
 * - Playlist linked and authenticated: Green playlist name with dropdown
 */
function SpotifyStatus({
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

/**
 * YouTube TV connection status indicator in the header.
 *
 * States:
 * - Disconnected: Red "Connect TV" button → opens inline pairing code input
 * - Connecting: Blue loading spinner
 * - Connected: Green badge with TV icon + screenName, dropdown with disconnect option
 * - Error: Amber badge with error message, dropdown with reconnect option
 */
function YouTubeStatus({
  loungeStatus,
  onPair,
  onDisconnect,
  onReconnect,
  isPairing,
  isReconnecting,
}: {
  loungeStatus: LoungeStatus | undefined
  onPair: (code: string) => void
  onDisconnect: () => void
  onReconnect: () => void
  isPairing: boolean
  isReconnecting: boolean
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [pairingInput, setPairingInput] = useState('')
  const [showPairingInput, setShowPairingInput] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useClickOutside(dropdownRef, useCallback(() => {
    setDropdownOpen(false)
    setShowPairingInput(false)
  }, []))

  const status = loungeStatus?.status ?? 'disconnected'

  const handlePair = () => {
    const code = pairingInput.replace(/\D/g, '')
    if (code) {
      onPair(code)
      setPairingInput('')
      setShowPairingInput(false)
    }
  }

  if (status === 'connecting' || isPairing || isReconnecting) {
    return (
      <div className="h-8 w-8 rounded bg-blue-100 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
      </div>
    )
  }

  if (status === 'disconnected') {
    return (
      <div className="relative" ref={dropdownRef}>
        <Button
          size="sm"
          onClick={() => setShowPairingInput(!showPairingInput)}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          <Tv className="h-4 w-4 mr-1" />
          Connect TV
        </Button>

        {showPairingInput && (
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border p-3 z-20">
            <p className="text-sm font-medium mb-2">Enter TV pairing code</p>
            <div className="flex gap-2">
              <Input
                placeholder="Pairing code..."
                value={pairingInput}
                onChange={(e) => setPairingInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePair()}
                autoFocus
              />
              <Button size="sm" onClick={handlePair} disabled={!pairingInput.replace(/\D/g, '')}>
                Pair
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (status === 'error') {
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
              <p className="text-xs text-amber-600 font-medium">TV Disconnected</p>
              <p className="text-sm text-muted-foreground mt-1">
                {loungeStatus?.error || 'Connection lost'}
              </p>
            </div>
            <button
              onClick={() => {
                setDropdownOpen(false)
                onReconnect()
              }}
              className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-muted transition-colors text-amber-700 font-medium"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Reconnect TV</span>
            </button>
            <button
              onClick={() => {
                setDropdownOpen(false)
                onDisconnect()
              }}
              className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-muted transition-colors text-red-600"
            >
              <Unplug className="h-4 w-4" />
              <span>Disconnect</span>
            </button>
          </div>
        )}
      </div>
    )
  }

  // Connected state
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-2 px-2 py-1 rounded-lg border border-green-200 bg-green-50 hover:bg-green-100 transition-colors"
      >
        <div className="h-7 w-7 rounded bg-green-600 flex items-center justify-center">
          <Tv className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-medium text-green-800 max-w-[150px] truncate">
          {loungeStatus?.screenName || 'TV Connected'}
        </span>
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border py-1 z-20">
          <div className="px-3 py-2 border-b">
            <p className="text-xs text-muted-foreground">Connected TV</p>
            <p className="font-medium truncate">{loungeStatus?.screenName || 'YouTube TV'}</p>
          </div>
          <button
            onClick={() => {
              setDropdownOpen(false)
              onDisconnect()
            }}
            className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-muted transition-colors text-red-600"
          >
            <Unplug className="h-4 w-4" />
            <span>Disconnect</span>
          </button>
        </div>
      )}
    </div>
  )
}

export function SessionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isAdmin, friendAccessKey, logout, sessionId, token } = useAuthStore()

  // ----- Local State -----
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SpotifyTrack[]>([])
  const [youtubeResults, setYoutubeResults] = useState<YouTubeVideo[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)
  const [approveError, setApproveError] = useState<string | null>(null)
  const [usePolling, setUsePolling] = useState(false)

  // Search filter state
  const [artistFilter, setArtistFilter] = useState('')
  const [albumFilter, setAlbumFilter] = useState('')
  const [trackFilter, setTrackFilter] = useState('')
  const [showArtist, setShowArtist] = useState(false)
  const [showAlbum, setShowAlbum] = useState(false)
  const [showTrack, setShowTrack] = useState(false)

  // ----- Auth Guard -----
  // Redirect to home if not authenticated or accessing wrong session
  useEffect(() => {
    if (!sessionId || sessionId !== id) {
      navigate('/')
    }
  }, [sessionId, id, navigate])

  // ----- Data Fetching -----

  // Session details (cached, invalidated on settings changes)
  const { data: session, isLoading: sessionLoading } = useQuery<Session>({
    queryKey: ['session', id],
    queryFn: () => api.getSession(id!),
    enabled: !!id,
  })

  // Restore Spotify session from localStorage token on page load
  // Verifies the token is still valid by fetching the linked playlist
  useEffect(() => {
    if (isAdmin && session?.spotifyPlaylistId) {
      tryRestoreSpotifySession(session.spotifyPlaylistId).then((restored) => {
        if (restored) {
          // Invalidate session query to trigger re-render with updated Spotify auth state
          queryClient.invalidateQueries({ queryKey: ['session', id] })
        }
      })
    }
  }, [isAdmin, session?.spotifyPlaylistId, queryClient, id])

  // Song requests with 5-second polling for real-time updates
  const { data: requests = [], isLoading: requestsLoading } = useQuery<SongRequest[]>({
    queryKey: ['requests', id],
    queryFn: () => api.getSongRequests(id!),
    enabled: !!id,
    refetchInterval: usePolling ? 5000 : false,
    refetchIntervalInBackground: false, // Don't poll when tab is not visible
  })

  // SSE for real-time updates (falls back to polling on repeated failures)
  useRequestsSSE({
    sessionId: id,
    token,
    onFallbackToPolling: () => setUsePolling(true),
  })

  // ----- Mutations -----

  // Submit a new song request (available to all users)
  const submitMutation = useMutation({
    mutationFn: (track: SpotifyTrack) => api.submitSongRequest(id!, track),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests', id] })
      setSearchQuery('')
      setSearchResults([])
      toast.success('Song request submitted')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit song request')
    },
  })

  // Submit a YouTube video request (available to all users)
  const submitYouTubeMutation = useMutation({
    mutationFn: (video: YouTubeVideo) => api.submitYouTubeRequest(id!, video),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests', id] })
      setSearchQuery('')
      setYoutubeResults([])
      toast.success('Song request submitted')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit song request')
    },
  })

  // Approve a request (admin only)
  // Order: Check Spotify auth -> Add to playlist -> Mark approved in backend
  const approveMutation = useMutation({
    mutationFn: async (requestId: number) => {
      if (session?.musicService !== 'youtube') {
        // Block approval if playlist is linked but Spotify isn't connected
        if (session?.spotifyPlaylistId && !isSpotifyAuthenticated()) {
          throw new Error('Spotify connection required. Please reconnect to Spotify to approve songs.')
        }

        const request = requests.find((r) => r.id === requestId)

        // Add to Spotify playlist first - ensures we don't mark approved if Spotify fails
        if (session?.spotifyPlaylistId && isSpotifyAuthenticated() && request) {
          await addTrackToPlaylist(session.spotifyPlaylistId, request.externalUri)
        }
      }

      // Only mark as approved after successful Spotify add (or for YouTube, just approve directly)
      return api.approveSongRequest(id!, requestId)
    },
    onSuccess: () => {
      setApproveError(null)
      queryClient.invalidateQueries({ queryKey: ['requests', id] })
      toast.success('Song approved')
    },
    onError: (error: Error) => {
      // Spotify connection errors show inline (actionable), others show toast
      if (error.message.includes('Spotify connection required')) {
        setApproveError(error.message)
      } else {
        toast.error(error.message || 'Failed to approve song')
      }
    },
  })

  // ----- YouTube Lounge (TV Pairing) -----

  // Lounge status polling (admin + YouTube sessions only)
  const { data: loungeStatus } = useQuery<LoungeStatus>({
    queryKey: ['loungeStatus', id],
    queryFn: () => api.getLoungeStatus(id!),
    enabled: !!id && isAdmin && session?.musicService === 'youtube',
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  })

  // Surface toast when lounge status changes to error (e.g. poll failures)
  const prevLoungeStatusRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const currentStatus = loungeStatus?.status
    if (currentStatus === 'error' && prevLoungeStatusRef.current !== 'error') {
      toast.error(loungeStatus?.error || 'TV connection lost')
    }
    prevLoungeStatusRef.current = currentStatus
  }, [loungeStatus?.status, loungeStatus?.error])

  // Pair with YouTube TV
  const pairLoungeMutation = useMutation({
    mutationFn: (pairingCode: string) => api.pairLounge(id!, pairingCode),
    onSuccess: (data) => {
      queryClient.setQueryData(['loungeStatus', id], data)
      toast.success('Connected to TV')
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ['loungeStatus', id] })
      toast.error(error.message || 'Failed to pair with TV')
    },
  })

  // Disconnect from YouTube TV
  const disconnectLoungeMutation = useMutation({
    mutationFn: () => api.disconnectLounge(id!),
    onSuccess: (data) => {
      queryClient.setQueryData(['loungeStatus', id], data)
      toast.success('Disconnected from TV')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to disconnect')
    },
  })

  // Play next (approve + play immediately on TV)
  const playNextMutation = useMutation({
    mutationFn: (requestId: number) => api.playNextSongRequest(id!, requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests', id] })
      toast.success('Playing on TV')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to play on TV')
    },
  })

  // Reconnect to YouTube TV using saved credentials
  const reconnectLoungeMutation = useMutation({
    mutationFn: () => api.reconnectLounge(id!),
    onSuccess: (data) => {
      queryClient.setQueryData(['loungeStatus', id], data)
      toast.success('Reconnected to TV')
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ['loungeStatus', id] })
      toast.error(error.message || 'Failed to reconnect')
    },
  })

  // Reject a request (admin only)
  const rejectMutation = useMutation({
    mutationFn: (requestId: number) => api.rejectSongRequest(id!, requestId),
    onSuccess: () => {
      toast.success('Song rejected')
      queryClient.invalidateQueries({ queryKey: ['requests', id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reject song')
    },
  })

  // ----- Event Handlers -----

  // Search Spotify for tracks
  const handleSearch = async () => {
    let query = searchQuery.trim()
    if (artistFilter.trim()) query += ` artist:${artistFilter.trim()}`
    if (albumFilter.trim()) query += ` album:${albumFilter.trim()}`
    if (trackFilter.trim()) query += ` track:${trackFilter.trim()}`

    if (!query) return

    setIsSearching(true)
    try {
      const response = await api.searchSpotify(query)
      setSearchResults(response.tracks)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Search failed'
      toast.error(message)
    } finally {
      setIsSearching(false)
    }
  }

  // Search YouTube for videos
  const handleYouTubeSearch = async () => {
    const query = searchQuery.trim()
    if (!query) return

    setIsSearching(true)
    try {
      const response = await api.searchYouTube(query)
      setYoutubeResults(response.videos)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Search failed'
      toast.error(message)
    } finally {
      setIsSearching(false)
    }
  }

  // Copy friend access key to clipboard (admin only)
  const handleCopyKey = () => {
    if (friendAccessKey) {
      navigator.clipboard.writeText(friendAccessKey)
      setCopiedKey(true)
      setTimeout(() => setCopiedKey(false), 2000)
    }
  }

  // Clear auth state and return to home
  const handleLogout = () => {
    logout()
    navigate('/')
  }

  // Start Spotify OAuth flow -> redirects to Spotify -> comes back to /callback
  const handleSpotifyAuth = async () => {
    try {
      await authenticateSpotify()
      navigate('/callback')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Spotify authentication failed'
      toast.error(message)
    }
  }

  // ----- Computed Values -----

  /**
   * Check if a track should be blocked based on session settings.
   * Returns a human-readable reason if blocked, null otherwise.
   * Memoized to avoid recalculating on every render.
   */
  const getBlockReason = useMemo(() => {
    return (track: SpotifyTrack): string | null => {
      if (!session) return null

      // Check duration limit
      if (session.songDurationLimitMs && track.durationMs > session.songDurationLimitMs) {
        return `Song exceeds ${formatDuration(session.songDurationLimitMs)} time limit`
      }

      // Check prohibited patterns (case-insensitive substring match)
      for (const p of session.prohibitedPatterns || []) {
        if (p.patternType === 'artist' &&
            track.artists.some(a => a.toLowerCase().includes(p.pattern.toLowerCase()))) {
          return `Artist matches prohibited pattern "${p.pattern}"`
        }
        if (p.patternType === 'title' &&
            track.name.toLowerCase().includes(p.pattern.toLowerCase())) {
          return `Title matches prohibited pattern "${p.pattern}"`
        }
      }

      return null
    }
  }, [session])

  /**
   * Check if a YouTube video should be blocked based on session settings.
   * Returns a human-readable reason if blocked, null otherwise.
   */
  const getYouTubeBlockReason = useMemo(() => {
    return (video: YouTubeVideo): string | null => {
      if (!session) return null

      for (const p of session.prohibitedPatterns || []) {
        if (p.patternType === 'title' &&
            video.title.toLowerCase().includes(p.pattern.toLowerCase())) {
          return `Title matches prohibited pattern "${p.pattern}"`
        }
      }

      // Check duration limit
      if (session.songDurationLimitMs && video.durationMs > session.songDurationLimitMs) {
        return `Song exceeds ${formatDuration(session.songDurationLimitMs)} time limit`
      }

      return null
    }
  }, [session])

  /** Get the external link URL for a song request based on the session's music service */
  const getExternalLink = (request: SongRequest): string => {
    if (session?.musicService === 'youtube') {
      return request.externalUri
    }
    return `https://open.spotify.com/track/${request.externalTrackId}`
  }

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const pendingRequests = requests
    .filter((r) => r.status === 'pending')
    .sort((a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime())
  const processedRequests = requests
    .filter((r) => r.status !== 'pending')
    .sort((a, b) => new Date(b.processedAt ?? b.requestedAt).getTime() - new Date(a.processedAt ?? a.requestedAt).getTime())

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-pink-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Music className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-semibold">{session?.displayName}</h1>
              {isAdmin && <Badge variant="secondary">Admin</Badge>}
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && session?.musicService !== 'youtube' && (
                <SpotifyStatus
                  key={session?.spotifyPlaylistId || 'no-playlist'}
                  playlistId={session?.spotifyPlaylistId}
                  playlistName={session?.spotifyPlaylistName}
                  isAuthenticated={isSpotifyAuthenticated()}
                  onConnect={handleSpotifyAuth}
                  onChangePlaylist={handleSpotifyAuth}
                />
              )}
              {isAdmin && session?.musicService === 'youtube' && (
                <YouTubeStatus
                  loungeStatus={loungeStatus}
                  onPair={(code) => pairLoungeMutation.mutate(code)}
                  onDisconnect={() => disconnectLoungeMutation.mutate()}
                  onReconnect={() => reconnectLoungeMutation.mutate()}
                  isPairing={pairLoungeMutation.isPending}
                  isReconnecting={reconnectLoungeMutation.isPending}
                />
              )}
              {isAdmin && friendAccessKey && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyKey}
                  className="flex items-center gap-1"
                >
                  <Share2 className="h-4 w-4" />
                  <span className="hidden sm:inline">{copiedKey ? 'Copied!' : friendAccessKey}</span>
                  <span className="sm:hidden">{copiedKey ? 'Copied!' : 'Share'}</span>
                </Button>
              )}
              {isAdmin && session && (
                <AdminSettings
                  session={session}
                  onSessionUpdate={() => queryClient.invalidateQueries({ queryKey: ['session', id] })}
                />
              )}
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Search Section */}
        {session?.musicService === 'youtube' ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search Videos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    placeholder="Search for a video..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleYouTubeSearch()}
                    className={searchQuery || youtubeResults.length > 0 ? 'pr-8' : ''}
                  />
                  {(searchQuery || youtubeResults.length > 0) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('')
                        setYoutubeResults([])
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <Button onClick={handleYouTubeSearch} disabled={isSearching}>
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
                </Button>
              </div>

              {/* YouTube Search Results */}
              {youtubeResults.length > 0 && (
                <div className="mt-4 space-y-2">
                  {youtubeResults.map((video) => {
                    const blockReason = getYouTubeBlockReason(video)
                    const isBlocked = blockReason !== null

                    return (
                      <div
                        key={video.id}
                        className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                          isBlocked
                            ? 'bg-muted/30 opacity-60'
                            : 'bg-muted/50 hover:bg-muted'
                        }`}
                      >
                        <a
                          href={`https://www.youtube.com/watch?v=${video.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity"
                        >
                          {video.thumbnailUrl && (
                            <img
                              src={video.thumbnailUrl}
                              alt={video.title}
                              className="w-16 h-12 object-cover rounded flex-shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium">{video.title}</p>
                            <p className="text-sm text-muted-foreground">
                              {video.channelTitle}
                            </p>
                          </div>
                        </a>
                        {video.durationMs > 0 && (
                          <span className="text-sm text-muted-foreground flex-shrink-0">
                            {formatDuration(video.durationMs)}
                          </span>
                        )}
                        <div className="ml-auto flex-shrink-0">
                          {isBlocked ? (
                            <div
                              className="relative group"
                              title={blockReason}
                            >
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled
                                className="text-muted-foreground cursor-not-allowed"
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                              <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-48 p-2 text-xs bg-popover text-popover-foreground rounded-md shadow-md border z-10">
                                {blockReason}
                              </div>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => submitYouTubeMutation.mutate(video)}
                              disabled={submitYouTubeMutation.isPending}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search Songs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Filter toggle buttons */}
              <div className="flex gap-2 mb-2">
                <Button
                  variant={showArtist ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    if (showArtist) setArtistFilter('')
                    setShowArtist(!showArtist)
                  }}
                >
                  Artist
                </Button>
                <Button
                  variant={showAlbum ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    if (showAlbum) setAlbumFilter('')
                    setShowAlbum(!showAlbum)
                  }}
                >
                  Album
                </Button>
                <Button
                  variant={showTrack ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    if (showTrack) setTrackFilter('')
                    setShowTrack(!showTrack)
                  }}
                >
                  Track
                </Button>
              </div>

              {/* Filter input fields */}
              {showArtist && (
                <Input
                  placeholder="Artist name..."
                  value={artistFilter}
                  onChange={(e) => setArtistFilter(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="mb-2"
                />
              )}
              {showAlbum && (
                <Input
                  placeholder="Album name..."
                  value={albumFilter}
                  onChange={(e) => setAlbumFilter(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="mb-2"
                />
              )}
              {showTrack && (
                <Input
                  placeholder="Track name..."
                  value={trackFilter}
                  onChange={(e) => setTrackFilter(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="mb-2"
                />
              )}

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    placeholder="Search for a song..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    className={searchQuery || searchResults.length > 0 || artistFilter || albumFilter || trackFilter ? 'pr-8' : ''}
                  />
                  {(searchQuery || searchResults.length > 0 || artistFilter || albumFilter || trackFilter) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('')
                        setSearchResults([])
                        setArtistFilter('')
                        setAlbumFilter('')
                        setTrackFilter('')
                        setShowArtist(false)
                        setShowAlbum(false)
                        setShowTrack(false)
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <Button onClick={handleSearch} disabled={isSearching}>
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
                </Button>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="mt-4 space-y-2">
                  {searchResults.map((track) => {
                    const blockReason = getBlockReason(track)
                    const isBlocked = blockReason !== null

                    return (
                      <div
                        key={track.id}
                        className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                          isBlocked
                            ? 'bg-muted/30 opacity-60'
                            : 'bg-muted/50 hover:bg-muted'
                        }`}
                      >
                        <a
                          href={`https://open.spotify.com/track/${track.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity"
                        >
                          {track.albumArtUrl && (
                            <img
                              src={track.albumArtUrl}
                              alt={track.albumName}
                              className="w-12 h-12 rounded flex-shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium">{track.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {track.artists.join(', ')} • {track.albumName}
                            </p>
                          </div>
                        </a>
                        <span className="text-sm text-muted-foreground ml-auto flex-shrink-0">
                          {formatDuration(track.durationMs)}
                        </span>
                        {isBlocked ? (
                          <div
                            className="relative group"
                            title={blockReason}
                          >
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled
                              className="text-muted-foreground cursor-not-allowed"
                            >
                              <Ban className="h-4 w-4" />
                            </Button>
                            <div className="absolute right-0 bottom-full mb-2 hidden group-hover:block w-48 p-2 text-xs bg-popover text-popover-foreground rounded-md shadow-md border z-10">
                              {blockReason}
                            </div>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => submitMutation.mutate(track)}
                            disabled={submitMutation.isPending}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Pending Requests */}
        {pendingRequests.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Pending Requests ({pendingRequests.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {approveError && (
                <div className="flex items-center gap-2 p-3 mb-3 rounded-lg bg-red-50 border border-red-200 text-red-800">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  <p className="text-sm">{approveError}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto h-6 w-6 text-red-600 hover:bg-red-100"
                    onClick={() => setApproveError(null)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
              <div className="space-y-2">
                {pendingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200"
                  >
                    <a
                      href={getExternalLink(request)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity"
                    >
                      {request.albumArtUrl && (
                        <img
                          src={request.albumArtUrl}
                          alt={request.albumName}
                          className="w-12 h-12 rounded flex-shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium">{request.trackName}</p>
                        <p className="text-sm text-muted-foreground">
                          {request.artistNames} • {request.albumName}
                        </p>
                        {request.requesterName && (
                          <p className="text-xs text-muted-foreground/70">
                            Requested by {request.requesterName}
                          </p>
                        )}
                      </div>
                    </a>
                    <span className="text-sm text-muted-foreground ml-auto flex-shrink-0">
                      {formatDuration(request.durationMs)}
                    </span>
                    <StatusBadge status={request.status} />
                    {isAdmin && (
                      <div className="flex gap-1">
                        {session?.musicService === 'youtube' && loungeStatus?.status === 'connected' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-blue-600 hover:bg-blue-100"
                            onClick={() => playNextMutation.mutate(request.id)}
                            disabled={playNextMutation.isPending}
                            title="Play Next"
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-green-600 hover:bg-green-100"
                          onClick={() => approveMutation.mutate(request.id)}
                          disabled={approveMutation.isPending}
                          title={session?.musicService === 'youtube' && loungeStatus?.status === 'connected' ? 'Add to Queue' : 'Approve'}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-100"
                          onClick={() => rejectMutation.mutate(request.id)}
                          disabled={rejectMutation.isPending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Processed Requests */}
        {processedRequests.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Request History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {processedRequests.map((request) => (
                  <div
                    key={request.id}
                    className={`flex items-center gap-3 p-3 rounded-lg ${
                      request.status === 'approved'
                        ? 'bg-green-50 border border-green-200'
                        : 'bg-red-50 border border-red-200'
                    }`}
                  >
                    <a
                      href={getExternalLink(request)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity"
                    >
                      {request.albumArtUrl && (
                        <img
                          src={request.albumArtUrl}
                          alt={request.albumName}
                          className="w-12 h-12 rounded flex-shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium">{request.trackName}</p>
                        <p className="text-sm text-muted-foreground">
                          {request.artistNames}
                        </p>
                        {request.requesterName && (
                          <p className="text-xs text-muted-foreground/70">
                            Requested by {request.requesterName}
                          </p>
                        )}
                        {request.rejectionReason && (
                          <p className="text-xs text-red-600 mt-1">
                            Reason: {request.rejectionReason}
                          </p>
                        )}
                      </div>
                    </a>
                    <span className="text-sm text-muted-foreground ml-auto flex-shrink-0">
                      {formatDuration(request.durationMs)}
                    </span>
                    <StatusBadge status={request.status} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {requests.length === 0 && !requestsLoading && (
          <Card>
            <CardContent className="py-12 text-center">
              <Music className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No song requests yet</h3>
              <p className="text-muted-foreground">
                Search for songs above to make your first request!
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}

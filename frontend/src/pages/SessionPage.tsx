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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AdminSettings } from '@/components/AdminSettings'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import type { Session, SongRequest, SpotifyTrack } from '@/types'
import {
  authenticateSpotify,
  isSpotifyAuthenticated,
  addTrackToPlaylist,
  getPlaylist,
  tryRestoreSpotifySession,
} from '@/services/spotify'
import { useClickOutside } from '@/hooks/useClickOutside'
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

export function SessionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isAdmin, friendAccessKey, logout, sessionId } = useAuthStore()

  // ----- Local State -----
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SpotifyTrack[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)
  const [approveError, setApproveError] = useState<string | null>(null)

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
    refetchInterval: 5000,
    refetchIntervalInBackground: false, // Don't poll when tab is not visible
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

  // Approve a request (admin only)
  // Order: Check Spotify auth -> Add to playlist -> Mark approved in backend
  const approveMutation = useMutation({
    mutationFn: async (requestId: number) => {
      // Block approval if playlist is linked but Spotify isn't connected
      if (session?.spotifyPlaylistId && !isSpotifyAuthenticated()) {
        throw new Error('Spotify connection required. Please reconnect to Spotify to approve songs.')
      }

      const request = requests.find((r) => r.id === requestId)

      // Add to Spotify playlist first - ensures we don't mark approved if Spotify fails
      if (session?.spotifyPlaylistId && isSpotifyAuthenticated() && request) {
        await addTrackToPlaylist(session.spotifyPlaylistId, request.spotifyUri)
      }

      // Only mark as approved after successful Spotify add
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
    if (!searchQuery.trim()) return

    setIsSearching(true)
    try {
      const response = await api.searchSpotify(searchQuery)
      setSearchResults(response.tracks)
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

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  const pendingRequests = requests.filter((r) => r.status === 'pending')
  const processedRequests = requests.filter((r) => r.status !== 'pending')

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
              {isAdmin && (
                <SpotifyStatus
                  key={session?.spotifyPlaylistId || 'no-playlist'}
                  playlistId={session?.spotifyPlaylistId}
                  playlistName={session?.spotifyPlaylistName}
                  isAuthenticated={isSpotifyAuthenticated()}
                  onConnect={handleSpotifyAuth}
                  onChangePlaylist={handleSpotifyAuth}
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
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search Songs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  placeholder="Search for a song..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className={searchQuery || searchResults.length > 0 ? 'pr-8' : ''}
                />
                {(searchQuery || searchResults.length > 0) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('')
                      setSearchResults([])
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
                          <p className="font-medium truncate">{track.name}</p>
                          <p className="text-sm text-muted-foreground truncate">
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
                      href={`https://open.spotify.com/track/${request.spotifyTrackId}`}
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
                        <p className="font-medium truncate">{request.trackName}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {request.artistNames} • {request.albumName}
                        </p>
                      </div>
                    </a>
                    <span className="text-sm text-muted-foreground ml-auto flex-shrink-0">
                      {formatDuration(request.durationMs)}
                    </span>
                    <StatusBadge status={request.status} />
                    {isAdmin && (
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-green-600 hover:bg-green-100"
                          onClick={() => approveMutation.mutate(request.id)}
                          disabled={approveMutation.isPending}
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
                      href={`https://open.spotify.com/track/${request.spotifyTrackId}`}
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
                        <p className="font-medium truncate">{request.trackName}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {request.artistNames}
                        </p>
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

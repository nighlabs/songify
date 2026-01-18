import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import type { Session, SongRequest, SpotifyTrack } from '@/types'
import {
  authenticateSpotify,
  isSpotifyAuthenticated,
  addTrackToPlaylist,
  getPlaylist,
} from '@/services/spotify'

type PlaylistInfo = {
  name: string
  imageUrl: string | null
  externalUrl: string
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

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

function SpotifyStatus({
  playlistId,
  playlistName,
  onConnect,
  onChangePlaylist
}: {
  playlistId: string | null | undefined
  playlistName: string | null | undefined
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
    if (!playlistId || !isSpotifyAuthenticated()) {
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
  }, [playlistId])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SpotifyTrack[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [copiedKey, setCopiedKey] = useState(false)

  // Redirect if not authenticated or wrong session
  useEffect(() => {
    if (!sessionId || sessionId !== id) {
      navigate('/')
    }
  }, [sessionId, id, navigate])

  // Fetch session details
  const { data: session, isLoading: sessionLoading } = useQuery<Session>({
    queryKey: ['session', id],
    queryFn: () => api.getSession(id!),
    enabled: !!id,
  })

  // Fetch song requests with polling
  const { data: requests = [], isLoading: requestsLoading } = useQuery<SongRequest[]>({
    queryKey: ['requests', id],
    queryFn: () => api.getSongRequests(id!),
    enabled: !!id,
    refetchInterval: 5000,
  })

  // Submit request mutation
  const submitMutation = useMutation({
    mutationFn: (track: SpotifyTrack) => api.submitSongRequest(id!, track),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests', id] })
      setSearchQuery('')
      setSearchResults([])
    },
  })

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (requestId: number) => {
      const result = await api.approveSongRequest(id!, requestId)
      // Try to add to Spotify playlist
      if (session?.spotifyPlaylistId && isSpotifyAuthenticated()) {
        const request = requests.find((r) => r.id === requestId)
        if (request) {
          try {
            await addTrackToPlaylist(session.spotifyPlaylistId, request.spotifyUri)
          } catch (e) {
            console.error('Failed to add to playlist:', e)
          }
        }
      }
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests', id] })
    },
  })

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: (requestId: number) => api.rejectSongRequest(id!, requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests', id] })
    },
  })

  // Search handler
  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    setIsSearching(true)
    try {
      const response = await api.searchSpotify(searchQuery)
      setSearchResults(response.tracks)
    } catch (e) {
      console.error('Search failed:', e)
    } finally {
      setIsSearching(false)
    }
  }

  // Copy access key
  const handleCopyKey = () => {
    if (friendAccessKey) {
      navigator.clipboard.writeText(friendAccessKey)
      setCopiedKey(true)
      setTimeout(() => setCopiedKey(false), 2000)
    }
  }

  // Handle logout
  const handleLogout = () => {
    logout()
    navigate('/')
  }

  // Spotify auth for admin - triggers OAuth flow which redirects to /callback
  const handleSpotifyAuth = async () => {
    try {
      await authenticateSpotify()
      // After authentication, navigate to callback to select playlist
      navigate('/callback')
    } catch (e) {
      console.error('Spotify auth failed:', e)
    }
  }

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
              <Input
                placeholder="Search for a song..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button onClick={handleSearch} disabled={isSearching}>
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
              </Button>
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="mt-4 space-y-2">
                {searchResults.map((track) => (
                  <div
                    key={track.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    {track.albumArtUrl && (
                      <img
                        src={track.albumArtUrl}
                        alt={track.albumName}
                        className="w-12 h-12 rounded"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{track.name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {track.artists.join(', ')} • {track.albumName}
                      </p>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {formatDuration(track.durationMs)}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => submitMutation.mutate(track)}
                      disabled={submitMutation.isPending}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
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
              <div className="space-y-2">
                {pendingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200"
                  >
                    {request.albumArtUrl && (
                      <img
                        src={request.albumArtUrl}
                        alt={request.albumName}
                        className="w-12 h-12 rounded"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{request.trackName}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {request.artistNames} • {request.albumName}
                      </p>
                    </div>
                    <span className="text-sm text-muted-foreground">
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
                    {request.albumArtUrl && (
                      <img
                        src={request.albumArtUrl}
                        alt={request.albumName}
                        className="w-12 h-12 rounded"
                      />
                    )}
                    <div className="flex-1 min-w-0">
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

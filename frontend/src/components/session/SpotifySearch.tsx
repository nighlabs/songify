import { useState, useMemo } from 'react'
import { Search, X, Loader2, Plus, Ban } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/services/api'
import type { Session, SpotifyTrack } from '@/types'
import { formatDuration } from '@/lib/utils'

export function SpotifySearch({
  session,
}: {
  session: Session
}) {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SpotifyTrack[]>([])
  const [isSearching, setIsSearching] = useState(false)

  // Filter state
  const [artistFilter, setArtistFilter] = useState('')
  const [albumFilter, setAlbumFilter] = useState('')
  const [trackFilter, setTrackFilter] = useState('')
  const [showArtist, setShowArtist] = useState(false)
  const [showAlbum, setShowAlbum] = useState(false)
  const [showTrack, setShowTrack] = useState(false)

  const submitMutation = useMutation({
    mutationFn: (track: SpotifyTrack) => api.submitSongRequest(session.id, track),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests', session.id] })
      setSearchQuery('')
      setSearchResults([])
      toast.success('Song request submitted')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit song request')
    },
  })

  const getBlockReason = useMemo(() => {
    return (track: SpotifyTrack): string | null => {
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

  return (
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
  )
}

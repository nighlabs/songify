import { useState, useMemo } from 'react'
import { Search, X, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SearchResultItem } from './SearchResultItem'
import { api } from '@/services/api'
import type { Session, SpotifyTrack } from '@/types'
import { getBlockReason } from '@/lib/blockReason'

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

  const getTrackBlockReason = useMemo(() => {
    return (track: SpotifyTrack): string | null =>
      getBlockReason(
        { title: track.name, artists: track.artists, durationMs: track.durationMs },
        session.prohibitedPatterns,
        session.songDurationLimitMs
      )
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
            {searchResults.map((track) => (
              <SearchResultItem
                key={track.id}
                id={track.id}
                title={track.name}
                subtitle={`${track.artists.join(', ')} • ${track.albumName}`}
                imageUrl={track.albumArtUrl}
                imageAlt={track.albumName}
                imageClassName="w-12 h-12 rounded"
                externalUrl={`https://open.spotify.com/track/${track.id}`}
                durationMs={track.durationMs}
                blockReason={getTrackBlockReason(track)}
                onSubmit={() => submitMutation.mutate(track)}
                isSubmitting={submitMutation.isPending}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

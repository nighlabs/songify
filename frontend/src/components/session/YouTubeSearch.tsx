import { useState, useMemo } from 'react'
import { Search, X, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SearchResultItem } from './SearchResultItem'
import { api } from '@/services/api'
import type { Session, YouTubeVideo } from '@/types'
import { getBlockReason } from '@/lib/blockReason'

export function YouTubeSearch({
  session,
}: {
  session: Session
}) {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [youtubeResults, setYoutubeResults] = useState<YouTubeVideo[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const submitYouTubeMutation = useMutation({
    mutationFn: (video: YouTubeVideo) => api.submitYouTubeRequest(session.id, video),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests', session.id] })
      setSearchQuery('')
      setYoutubeResults([])
      toast.success('Song request submitted')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit song request')
    },
  })

  const getVideoBlockReason = useMemo(() => {
    return (video: YouTubeVideo): string | null =>
      getBlockReason(
        { title: video.title, durationMs: video.durationMs },
        session.prohibitedPatterns,
        session.songDurationLimitMs
      )
  }, [session])

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

  return (
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
            {youtubeResults.map((video) => (
              <SearchResultItem
                key={video.id}
                id={video.id}
                title={video.title}
                subtitle={video.channelTitle}
                imageUrl={video.thumbnailUrl}
                imageAlt={video.title}
                imageClassName="w-16 h-12 object-cover rounded"
                externalUrl={`https://www.youtube.com/watch?v=${video.id}`}
                durationMs={video.durationMs}
                blockReason={getVideoBlockReason(video)}
                onSubmit={() => submitYouTubeMutation.mutate(video)}
                isSubmitting={submitYouTubeMutation.isPending}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

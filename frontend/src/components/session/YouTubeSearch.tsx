import { useState, useMemo } from 'react'
import { Search, X, Loader2, Plus, Ban } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/services/api'
import type { Session, YouTubeVideo } from '@/types'
import { formatDuration } from '@/lib/utils'

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

  const getYouTubeBlockReason = useMemo(() => {
    return (video: YouTubeVideo): string | null => {
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
  )
}

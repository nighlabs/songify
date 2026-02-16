/**
 * Dialog for managing prohibition patterns.
 *
 * Patterns are case-insensitive substrings that block matching songs.
 * Two pattern types:
 * - Artist: Blocks songs by artists matching the pattern
 * - Title: Blocks songs with titles matching the pattern
 *
 * Example: Adding artist pattern "bieber" blocks all Justin Bieber songs.
 */

import { useState } from 'react'
import { Loader2, X, Plus } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { api } from '@/services/api'
import type { ProhibitedPattern } from '@/types'

interface PatternsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId: string
  patterns: ProhibitedPattern[]  // Current patterns from session
  musicService: 'spotify' | 'youtube'
  onUpdate: () => void           // Called after adding/removing patterns
}

export function PatternsDialog({
  open,
  onOpenChange,
  sessionId,
  patterns,
  musicService,
  onUpdate,
}: PatternsDialogProps) {
  const showArtist = musicService === 'spotify'
  const [patternType, setPatternType] = useState<'artist' | 'title'>(showArtist ? 'artist' : 'title')
  const [pattern, setPattern] = useState('')
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const handleAdd = async () => {
    if (!pattern.trim()) {
      setError('Please enter a pattern')
      return
    }

    setError('')
    setAdding(true)
    try {
      await api.createProhibitedPattern(sessionId, patternType, pattern.trim())
      setPattern('')
      onUpdate()
      toast.success('Pattern added')
    } catch {
      toast.error('Failed to add pattern')
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (patternId: number) => {
    setDeletingId(patternId)
    try {
      await api.deleteProhibitedPattern(sessionId, patternId)
      onUpdate()
      toast.success('Pattern removed')
    } catch {
      toast.error('Failed to delete pattern')
    } finally {
      setDeletingId(null)
    }
  }

  const artistPatterns = patterns.filter(p => p.patternType === 'artist')
  const titlePatterns = patterns.filter(p => p.patternType === 'title')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Prohibition Patterns</DialogTitle>
          <DialogDescription>
            {showArtist
              ? 'Add patterns to filter out songs from search results. Songs with matching artist names or titles will be hidden.'
              : 'Add patterns to filter out videos from search results. Videos with matching titles will be hidden.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add new pattern form */}
          <div className="space-y-3">
            {showArtist ? (
              <div className="flex gap-2">
                <Button
                  variant={patternType === 'artist' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPatternType('artist')}
                >
                  Artist
                </Button>
                <Button
                  variant={patternType === 'title' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPatternType('title')}
                >
                  Title
                </Button>
              </div>
            ) : (
              <p className="text-sm font-medium text-muted-foreground">Title Pattern</p>
            )}
            <div className="flex gap-2">
              <Input
                placeholder={`Enter ${patternType} pattern...`}
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <Button onClick={handleAdd} disabled={adding}>
                {adding ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          {/* Existing patterns */}
          {patterns.length > 0 && (
            <div className="space-y-3 pt-2 border-t">
              {showArtist && artistPatterns.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Artist Patterns</p>
                  <div className="flex flex-wrap gap-2">
                    {artistPatterns.map((p) => (
                      <Badge
                        key={p.id}
                        variant="secondary"
                        className="flex items-center gap-1 pr-1"
                      >
                        {p.pattern}
                        <button
                          onClick={() => handleDelete(p.id)}
                          disabled={deletingId === p.id}
                          className="ml-1 hover:bg-muted rounded p-0.5"
                        >
                          {deletingId === p.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {titlePatterns.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Title Patterns</p>
                  <div className="flex flex-wrap gap-2">
                    {titlePatterns.map((p) => (
                      <Badge
                        key={p.id}
                        variant="secondary"
                        className="flex items-center gap-1 pr-1"
                      >
                        {p.pattern}
                        <button
                          onClick={() => handleDelete(p.id)}
                          disabled={deletingId === p.id}
                          className="ml-1 hover:bg-muted rounded p-0.5"
                        >
                          {deletingId === p.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {patterns.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No patterns added yet. Add patterns above to filter search results.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

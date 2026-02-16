import { Plus, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDuration } from '@/lib/utils'

interface SearchResultItemProps {
  id: string
  title: string
  subtitle: string
  imageUrl?: string
  imageAlt: string
  imageClassName: string
  externalUrl: string
  durationMs: number
  blockReason: string | null
  onSubmit: () => void
  isSubmitting: boolean
}

export function SearchResultItem({
  id,
  title,
  subtitle,
  imageUrl,
  imageAlt,
  imageClassName,
  externalUrl,
  durationMs,
  blockReason,
  onSubmit,
  isSubmitting,
}: SearchResultItemProps) {
  const isBlocked = blockReason !== null

  return (
    <div
      key={id}
      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
        isBlocked ? 'bg-muted/30 opacity-60' : 'bg-muted/50 hover:bg-muted'
      }`}
    >
      <a
        href={externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity"
      >
        {imageUrl && (
          <img src={imageUrl} alt={imageAlt} className={`${imageClassName} flex-shrink-0`} />
        )}
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </a>
      {durationMs > 0 && (
        <span className="text-sm text-muted-foreground ml-auto flex-shrink-0">
          {formatDuration(durationMs)}
        </span>
      )}
      {isBlocked ? (
        <div className="relative group ml-auto flex-shrink-0" title={blockReason}>
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
          onClick={onSubmit}
          disabled={isSubmitting}
          className={durationMs > 0 ? '' : 'ml-auto'}
        >
          <Plus className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

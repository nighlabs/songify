import type { ReactNode } from 'react'
import { Check, X, Clock, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from './StatusBadge'
import type { SongRequest } from '@/types'
import { formatDuration } from '@/lib/utils'

export function PendingRequests({
  requests,
  isAdmin,
  approveError,
  onClearApproveError,
  onApprove,
  onReject,
  isApproving,
  isRejecting,
  getExternalLink,
  approveLabel,
  renderExtraActions,
}: {
  requests: SongRequest[]
  isAdmin: boolean
  approveError: string | null
  onClearApproveError: () => void
  onApprove: (requestId: number) => void
  onReject: (requestId: number) => void
  isApproving: boolean
  isRejecting: boolean
  getExternalLink: (request: SongRequest) => string
  approveLabel?: string
  renderExtraActions?: (request: SongRequest) => ReactNode
}) {
  if (requests.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Pending Requests ({requests.length})
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
              onClick={onClearApproveError}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        )}
        <div className="space-y-2">
          {requests.map((request) => (
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
                  {renderExtraActions?.(request)}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-green-600 hover:bg-green-100"
                    onClick={() => onApprove(request.id)}
                    disabled={isApproving}
                    title={approveLabel || 'Approve'}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-100"
                    onClick={() => onReject(request.id)}
                    disabled={isRejecting}
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
  )
}

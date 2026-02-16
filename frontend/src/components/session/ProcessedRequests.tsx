import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from './StatusBadge'
import type { SongRequest } from '@/types'
import { formatDuration } from '@/lib/utils'

export function ProcessedRequests({
  requests,
  getExternalLink,
}: {
  requests: SongRequest[]
  getExternalLink: (request: SongRequest) => string
}) {
  if (requests.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request History</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {requests.map((request) => (
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
  )
}

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SessionHeader } from './SessionHeader'
import { YouTubeStatus } from './YouTubeStatus'
import { YouTubeSearch } from './YouTubeSearch'
import { PendingRequests } from './PendingRequests'
import { ProcessedRequests } from './ProcessedRequests'
import { EmptyState } from './EmptyState'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/services/api'
import type { Session, SongRequest, LoungeStatus } from '@/types'

export function YouTubeSessionPage({
  session,
  requests,
  requestsLoading,
}: {
  session: Session
  requests: SongRequest[]
  requestsLoading: boolean
}) {
  const queryClient = useQueryClient()
  const { isAdmin } = useAuthStore()
  const [approveError, setApproveError] = useState<string | null>(null)

  // Lounge status polling (admin only)
  const { data: loungeStatus } = useQuery<LoungeStatus>({
    queryKey: ['loungeStatus', session.id],
    queryFn: () => api.getLoungeStatus(session.id),
    enabled: isAdmin,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  })

  // Surface toast when lounge status changes to error
  const prevLoungeStatusRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const currentStatus = loungeStatus?.status
    if (currentStatus === 'error' && prevLoungeStatusRef.current !== 'error') {
      toast.error(loungeStatus?.error || 'TV connection lost')
    }
    prevLoungeStatusRef.current = currentStatus
  }, [loungeStatus?.status, loungeStatus?.error])

  // Lounge mutations
  const pairLoungeMutation = useMutation({
    mutationFn: (pairingCode: string) => api.pairLounge(session.id, pairingCode),
    onSuccess: (data) => {
      queryClient.setQueryData(['loungeStatus', session.id], data)
      toast.success('Connected to TV')
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ['loungeStatus', session.id] })
      toast.error(error.message || 'Failed to pair with TV')
    },
  })

  const disconnectLoungeMutation = useMutation({
    mutationFn: () => api.disconnectLounge(session.id),
    onSuccess: (data) => {
      queryClient.setQueryData(['loungeStatus', session.id], data)
      toast.success('Disconnected from TV')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to disconnect')
    },
  })

  const reconnectLoungeMutation = useMutation({
    mutationFn: () => api.reconnectLounge(session.id),
    onSuccess: (data) => {
      queryClient.setQueryData(['loungeStatus', session.id], data)
      toast.success('Reconnected to TV')
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ['loungeStatus', session.id] })
      toast.error(error.message || 'Failed to reconnect')
    },
  })

  const playNextMutation = useMutation({
    mutationFn: (requestId: number) => api.playNextSongRequest(session.id, requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requests', session.id] })
      toast.success('Playing on TV')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to play on TV')
    },
  })

  const approveMutation = useMutation({
    mutationFn: (requestId: number) => api.approveSongRequest(session.id, requestId),
    onSuccess: () => {
      setApproveError(null)
      queryClient.invalidateQueries({ queryKey: ['requests', session.id] })
      toast.success('Song approved')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to approve song')
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (requestId: number) => api.rejectSongRequest(session.id, requestId),
    onSuccess: () => {
      toast.success('Song rejected')
      queryClient.invalidateQueries({ queryKey: ['requests', session.id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reject song')
    },
  })

  const getExternalLink = (request: SongRequest): string => {
    return request.externalUri
  }

  const pendingRequests = requests
    .filter((r) => r.status === 'pending')
    .sort((a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime())
  const processedRequests = requests
    .filter((r) => r.status !== 'pending')
    .sort((a, b) => new Date(b.processedAt ?? b.requestedAt).getTime() - new Date(a.processedAt ?? a.requestedAt).getTime())

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-pink-50">
      <SessionHeader
        session={session}
        serviceStatus={
          isAdmin ? (
            <YouTubeStatus
              loungeStatus={loungeStatus}
              onPair={(code) => pairLoungeMutation.mutate(code)}
              onDisconnect={() => disconnectLoungeMutation.mutate()}
              onReconnect={() => reconnectLoungeMutation.mutate()}
              isPairing={pairLoungeMutation.isPending}
              isReconnecting={reconnectLoungeMutation.isPending}
            />
          ) : undefined
        }
      />

      <main className="container mx-auto px-4 py-6 space-y-6">
        <YouTubeSearch session={session} />

        <PendingRequests
          requests={pendingRequests}
          isAdmin={isAdmin}
          approveError={approveError}
          onClearApproveError={() => setApproveError(null)}
          onApprove={(id) => approveMutation.mutate(id)}
          onReject={(id) => rejectMutation.mutate(id)}
          isApproving={approveMutation.isPending}
          isRejecting={rejectMutation.isPending}
          getExternalLink={getExternalLink}
          approveLabel={loungeStatus?.status === 'connected' ? 'Add to Queue' : 'Approve'}
          renderExtraActions={
            loungeStatus?.status === 'connected'
              ? (request) => (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-blue-600 hover:bg-blue-100"
                    onClick={() => playNextMutation.mutate(request.id)}
                    disabled={playNextMutation.isPending}
                    title="Play Next"
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                )
              : undefined
          }
        />

        <ProcessedRequests
          requests={processedRequests}
          getExternalLink={getExternalLink}
        />

        {requests.length === 0 && !requestsLoading && <EmptyState />}
      </main>
    </div>
  )
}

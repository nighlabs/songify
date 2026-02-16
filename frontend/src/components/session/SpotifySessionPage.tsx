import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { SessionHeader } from './SessionHeader'
import { SpotifyStatus } from './SpotifyStatus'
import { SpotifySearch } from './SpotifySearch'
import { PendingRequests } from './PendingRequests'
import { ProcessedRequests } from './ProcessedRequests'
import { EmptyState } from './EmptyState'
import { useAuthStore } from '@/stores/authStore'
import {
  authenticateSpotify,
  isSpotifyAuthenticated,
  addTrackToPlaylist,
  tryRestoreSpotifySession,
} from '@/services/spotify'
import { useSortedRequests } from '@/hooks/useSortedRequests'
import { useRequestMutations } from '@/hooks/useRequestMutations'
import type { Session, SongRequest } from '@/types'

export function SpotifySessionPage({
  session,
  requests,
  requestsLoading,
}: {
  session: Session
  requests: SongRequest[]
  requestsLoading: boolean
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isAdmin } = useAuthStore()

  // Restore Spotify session from localStorage token on page load
  useEffect(() => {
    if (isAdmin && session.spotifyPlaylistId) {
      tryRestoreSpotifySession(session.spotifyPlaylistId).then((restored) => {
        if (restored) {
          queryClient.invalidateQueries({ queryKey: ['session', session.id] })
        }
      })
    }
  }, [isAdmin, session.spotifyPlaylistId, queryClient, session.id])

  const { approveMutation, rejectMutation, approveError, setApproveError } = useRequestMutations({
    sessionId: session.id,
    onBeforeApprove: async (requestId) => {
      if (session.spotifyPlaylistId && !isSpotifyAuthenticated()) {
        throw new Error('Spotify connection required. Please reconnect to Spotify to approve songs.')
      }

      const request = requests.find((r) => r.id === requestId)
      if (session.spotifyPlaylistId && isSpotifyAuthenticated() && request) {
        await addTrackToPlaylist(session.spotifyPlaylistId, request.externalUri)
      }
    },
    onApproveError: (error) => {
      if (error.message.includes('Spotify connection required')) {
        setApproveError(error.message)
      } else {
        toast.error(error.message || 'Failed to approve song')
      }
    },
  })

  const handleSpotifyAuth = async () => {
    try {
      await authenticateSpotify()
      navigate('/callback')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Spotify authentication failed'
      toast.error(message)
    }
  }

  const getExternalLink = (request: SongRequest): string => {
    return `https://open.spotify.com/track/${request.externalTrackId}`
  }

  const { pending: pendingRequests, processed: processedRequests } = useSortedRequests(requests)

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-pink-50">
      <SessionHeader
        session={session}
        serviceStatus={
          isAdmin ? (
            <SpotifyStatus
              key={session.spotifyPlaylistId || 'no-playlist'}
              playlistId={session.spotifyPlaylistId}
              playlistName={session.spotifyPlaylistName}
              isAuthenticated={isSpotifyAuthenticated()}
              onConnect={handleSpotifyAuth}
              onChangePlaylist={handleSpotifyAuth}
            />
          ) : undefined
        }
      />

      <main className="container mx-auto px-4 py-6 space-y-6">
        <SpotifySearch session={session} />

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

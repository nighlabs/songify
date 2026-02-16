import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { SessionHeader } from './SessionHeader'
import { SpotifyStatus } from './SpotifyStatus'
import { SpotifySearch } from './SpotifySearch'
import { PendingRequests } from './PendingRequests'
import { ProcessedRequests } from './ProcessedRequests'
import { EmptyState } from './EmptyState'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/services/api'
import {
  authenticateSpotify,
  isSpotifyAuthenticated,
  addTrackToPlaylist,
  tryRestoreSpotifySession,
} from '@/services/spotify'
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
  const [approveError, setApproveError] = useState<string | null>(null)

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

  const approveMutation = useMutation({
    mutationFn: async (requestId: number) => {
      // Block approval if playlist is linked but Spotify isn't connected
      if (session.spotifyPlaylistId && !isSpotifyAuthenticated()) {
        throw new Error('Spotify connection required. Please reconnect to Spotify to approve songs.')
      }

      const request = requests.find((r) => r.id === requestId)

      // Add to Spotify playlist first
      if (session.spotifyPlaylistId && isSpotifyAuthenticated() && request) {
        await addTrackToPlaylist(session.spotifyPlaylistId, request.externalUri)
      }

      return api.approveSongRequest(session.id, requestId)
    },
    onSuccess: () => {
      setApproveError(null)
      queryClient.invalidateQueries({ queryKey: ['requests', session.id] })
      toast.success('Song approved')
    },
    onError: (error: Error) => {
      if (error.message.includes('Spotify connection required')) {
        setApproveError(error.message)
      } else {
        toast.error(error.message || 'Failed to approve song')
      }
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

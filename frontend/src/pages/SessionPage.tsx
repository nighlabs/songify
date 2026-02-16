import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { SpotifySessionPage } from '@/components/session/SpotifySessionPage'
import { YouTubeSessionPage } from '@/components/session/YouTubeSessionPage'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import { useRequestsSSE } from '@/hooks/useRequestsSSE'
import type { Session, SongRequest } from '@/types'

export function SessionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { sessionId, token } = useAuthStore()
  const [usePolling, setUsePolling] = useState(false)

  // Auth guard
  useEffect(() => {
    if (!sessionId || sessionId !== id) {
      navigate('/')
    }
  }, [sessionId, id, navigate])

  // Session details
  const { data: session, isLoading: sessionLoading } = useQuery<Session>({
    queryKey: ['session', id],
    queryFn: () => api.getSession(id!),
    enabled: !!id,
  })

  // Song requests with optional polling fallback
  const { data: requests = [], isLoading: requestsLoading } = useQuery<SongRequest[]>({
    queryKey: ['requests', id],
    queryFn: () => api.getSongRequests(id!),
    enabled: !!id,
    refetchInterval: usePolling ? 5000 : false,
    refetchIntervalInBackground: false,
  })

  // SSE for real-time updates (falls back to polling on repeated failures)
  useRequestsSSE({
    sessionId: id,
    token,
    onFallbackToPolling: () => setUsePolling(true),
  })

  if (sessionLoading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (session.musicService === 'youtube') {
    return (
      <YouTubeSessionPage
        session={session}
        requests={requests}
        requestsLoading={requestsLoading}
      />
    )
  }

  return (
    <SpotifySessionPage
      session={session}
      requests={requests}
      requestsLoading={requestsLoading}
    />
  )
}

import { useState } from 'react'
import { useParams, Navigate } from 'react-router-dom'
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
  const { sessionId, token } = useAuthStore()
  const [usePolling, setUsePolling] = useState(false)

  // Auth guard — inline check so we redirect before rendering the spinner.
  // Using <Navigate> instead of useEffect avoids the render-then-redirect flash.
  if (!sessionId || !token || sessionId !== id) {
    return <Navigate to="/" replace />
  }

  // Session details — only fetch when we have valid auth state
  const { data: session, isLoading: sessionLoading, isError: sessionError } = useQuery<Session>({
    queryKey: ['session', id],
    queryFn: () => api.getSession(id!),
    enabled: !!id && !!token,
  })

  // Song requests with optional polling fallback
  const { data: requests = [], isLoading: requestsLoading } = useQuery<SongRequest[]>({
    queryKey: ['requests', id],
    queryFn: () => api.getSongRequests(id!),
    enabled: !!id && !!token,
    refetchInterval: usePolling ? 5000 : false,
    refetchIntervalInBackground: false,
  })

  // SSE for real-time updates (falls back to polling on repeated failures)
  useRequestsSSE({
    sessionId: id,
    token,
    onFallbackToPolling: () => setUsePolling(true),
  })

  // If the session query failed (e.g. expired JWT cleared auth via 401 handler),
  // redirect to home. This catches cases where the token was valid at render time
  // but the backend rejected it.
  if (sessionError) {
    return <Navigate to="/" replace />
  }

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

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

  const isAuthed = !!sessionId && !!token && sessionId === id

  // Session details — only fetch when we have valid auth state
  const { data: session, isLoading: sessionLoading, isError: sessionError } = useQuery<Session>({
    queryKey: ['session', id],
    queryFn: () => api.getSession(id!),
    enabled: !!id && isAuthed,
  })

  // Song requests with optional polling fallback
  const { data: requests = [], isLoading: requestsLoading } = useQuery<SongRequest[]>({
    queryKey: ['requests', id],
    queryFn: () => api.getSongRequests(id!),
    enabled: !!id && isAuthed,
    refetchInterval: usePolling ? 5000 : false,
    refetchIntervalInBackground: false,
  })

  // SSE for real-time updates (falls back to polling on repeated failures)
  useRequestsSSE({
    sessionId: isAuthed ? id : undefined,
    token: isAuthed ? token : null,
    onFallbackToPolling: () => setUsePolling(true),
  })

  // Auth guard — redirect when not authenticated. Placed after hooks to satisfy
  // Rules of Hooks; queries/SSE are disabled via `enabled`/params when !isAuthed.
  if (!isAuthed) {
    return <Navigate to="/" replace />
  }

  // If the session query failed (e.g. expired JWT cleared auth via 401 handler),
  // redirect to home.
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

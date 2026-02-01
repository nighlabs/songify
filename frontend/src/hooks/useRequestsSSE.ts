import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'

interface UseRequestsSSEOptions {
  sessionId: string | undefined
  token: string | null
  onFallbackToPolling: () => void
}

/**
 * Opens an SSE connection to receive real-time request update signals.
 *
 * On `requests_changed` events, invalidates the requests query so React Query
 * refetches. Tracks rapid failures (5 within 10s) and falls back to polling.
 *
 * Visibility-aware: closes the EventSource when the tab is hidden to save
 * battery/radio, and reopens + invalidates when the tab becomes visible.
 */
export function useRequestsSSE({ sessionId, token, onFallbackToPolling }: UseRequestsSSEOptions) {
  const queryClient = useQueryClient()
  const failuresRef = useRef<number[]>([])
  const fallbackTriggeredRef = useRef(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!sessionId || !token || fallbackTriggeredRef.current) return

    function connect() {
      if (fallbackTriggeredRef.current) return

      const url = `/api/sessions/${sessionId}/requests/stream?token=${encodeURIComponent(token!)}`
      const es = new EventSource(url)
      esRef.current = es

      es.addEventListener('connected', () => {
        failuresRef.current = []
      })

      es.addEventListener('requests_changed', () => {
        queryClient.invalidateQueries({ queryKey: ['requests', sessionId] })
      })

      es.onerror = () => {
        es.close()
        esRef.current = null

        const now = Date.now()
        failuresRef.current.push(now)
        // Keep only failures within the last 10 seconds
        failuresRef.current = failuresRef.current.filter((t) => now - t < 10_000)

        if (failuresRef.current.length >= 5) {
          fallbackTriggeredRef.current = true
          onFallbackToPolling()
          return
        }

        // Reconnect after a short delay
        setTimeout(connect, 2000)
      }
    }

    connect()

    function handleVisibility() {
      if (document.hidden) {
        esRef.current?.close()
        esRef.current = null
      } else {
        // Catch up on missed events
        queryClient.invalidateQueries({ queryKey: ['requests', sessionId] })
        if (!fallbackTriggeredRef.current) {
          connect()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      esRef.current?.close()
      esRef.current = null
    }
  }, [sessionId, token, queryClient, onFallbackToPolling])
}

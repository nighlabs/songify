import { useMemo } from 'react'
import type { SongRequest } from '@/types'

export function useSortedRequests(requests: SongRequest[]) {
  return useMemo(() => {
    const pending = requests
      .filter((r) => r.status === 'pending')
      .sort((a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime())
    const processed = requests
      .filter((r) => r.status !== 'pending')
      .sort(
        (a, b) =>
          new Date(b.processedAt ?? b.requestedAt).getTime() -
          new Date(a.processedAt ?? a.requestedAt).getTime()
      )
    return { pending, processed }
  }, [requests])
}

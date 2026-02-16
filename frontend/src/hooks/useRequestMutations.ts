import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/services/api'

export function useRequestMutations({
  sessionId,
  onBeforeApprove,
  onApproveSuccess,
  onApproveError,
}: {
  sessionId: string
  onBeforeApprove?: (requestId: number) => Promise<void>
  onApproveSuccess?: () => void
  onApproveError?: (error: Error) => void
}) {
  const queryClient = useQueryClient()
  const [approveError, setApproveError] = useState<string | null>(null)

  const approveMutation = useMutation({
    mutationFn: async (requestId: number) => {
      if (onBeforeApprove) {
        await onBeforeApprove(requestId)
      }
      return api.approveSongRequest(sessionId, requestId)
    },
    onSuccess: () => {
      setApproveError(null)
      queryClient.invalidateQueries({ queryKey: ['requests', sessionId] })
      toast.success('Song approved')
      onApproveSuccess?.()
    },
    onError: (error: Error) => {
      if (onApproveError) {
        onApproveError(error)
      } else {
        toast.error(error.message || 'Failed to approve song')
      }
    },
  })

  const rejectMutation = useMutation({
    mutationFn: (requestId: number) => api.rejectSongRequest(sessionId, requestId),
    onSuccess: () => {
      toast.success('Song rejected')
      queryClient.invalidateQueries({ queryKey: ['requests', sessionId] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reject song')
    },
  })

  return {
    approveMutation,
    rejectMutation,
    approveError,
    setApproveError,
  }
}

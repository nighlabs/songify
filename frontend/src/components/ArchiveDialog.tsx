import { useState } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { api } from '@/services/api'

interface ArchiveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId: string
  onUpdate: () => void
}

export function ArchiveDialog({
  open,
  onOpenChange,
  sessionId,
  onUpdate,
}: ArchiveDialogProps) {
  const [archiving, setArchiving] = useState(false)
  const [error, setError] = useState('')

  const handleArchive = async () => {
    setError('')
    setArchiving(true)
    try {
      await api.archiveAllRequests(sessionId)
      onUpdate()
      onOpenChange(false)
    } catch {
      setError('Failed to archive requests')
    } finally {
      setArchiving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Archive All Requests
          </DialogTitle>
          <DialogDescription>
            This will permanently delete all song requests in this session. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-muted-foreground">
            Use this to clear the queue when reusing a session for a new collaboration.
          </p>
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={archiving}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleArchive}
            disabled={archiving}
          >
            {archiving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Archive All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Dialog for setting the maximum song duration.
 *
 * Songs exceeding this limit are blocked from search results.
 * Useful for parties where you want to keep songs under a certain length.
 */

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/services/api'

interface TimeLimitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId: string
  currentLimitMs?: number        // Current limit in milliseconds
  onUpdate: () => void           // Called after saving changes
}

export function TimeLimitDialog({
  open,
  onOpenChange,
  sessionId,
  currentLimitMs,
  onUpdate,
}: TimeLimitDialogProps) {
  const [minutes, setMinutes] = useState('')
  const [seconds, setSeconds] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open && currentLimitMs) {
      setMinutes(String(Math.floor(currentLimitMs / 60000)))
      setSeconds(String(Math.floor((currentLimitMs % 60000) / 1000)))
    } else if (open) {
      setMinutes('')
      setSeconds('')
    }
  }, [open, currentLimitMs])

  const handleSave = async () => {
    setError('')
    const mins = parseInt(minutes) || 0
    const secs = parseInt(seconds) || 0

    if (mins === 0 && secs === 0) {
      setError('Please enter a valid time limit')
      return
    }

    const limitMs = (mins * 60 + secs) * 1000

    setSaving(true)
    try {
      await api.updateDurationLimit(sessionId, limitMs)
      onUpdate()
      onOpenChange(false)
      toast.success('Time limit updated')
    } catch {
      setError('Failed to update time limit')
      toast.error('Failed to update time limit')
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    setSaving(true)
    setError('')
    try {
      await api.updateDurationLimit(sessionId, null)
      onUpdate()
      onOpenChange(false)
      toast.success('Time limit cleared')
    } catch {
      setError('Failed to clear time limit')
      toast.error('Failed to clear time limit')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Song Time Limit</DialogTitle>
          <DialogDescription>
            Set a maximum duration for songs. Songs longer than this limit will be hidden from search results.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label htmlFor="minutes">Minutes</Label>
              <Input
                id="minutes"
                type="number"
                min="0"
                max="59"
                placeholder="0"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="seconds">Seconds</Label>
              <Input
                id="seconds"
                type="number"
                min="0"
                max="59"
                placeholder="0"
                value={seconds}
                onChange={(e) => setSeconds(e.target.value)}
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          {currentLimitMs && (
            <Button
              variant="outline"
              onClick={handleClear}
              disabled={saving}
            >
              Clear Limit
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

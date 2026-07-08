/**
 * Dialog for persisting the admin's Spotify login to the session.
 *
 * When enabled, the admin's Spotify auth token is encrypted client-side (with a
 * key derived from the session password) and stored on the backend, so the
 * admin can sign in from another device without re-authorizing with Spotify.
 * The backend only ever holds opaque ciphertext it cannot decrypt.
 */

import { useState } from 'react'
import { Loader2, Cloud, ShieldCheck } from 'lucide-react'
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
import { enableSpotifyPersistence, disableSpotifyPersistence } from '@/services/spotify'
import { hasTokenKey } from '@/services/crypto'

interface SpotifyPersistDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId: string
  enabled: boolean               // Current persistence state
  onUpdate: () => void           // Called after saving changes
}

export function SpotifyPersistDialog({
  open,
  onOpenChange,
  sessionId,
  enabled,
  onUpdate,
}: SpotifyPersistDialogProps) {
  const [saving, setSaving] = useState(false)

  const handleEnable = async () => {
    if (!hasTokenKey()) {
      toast.error('Sign in again from the rejoin screen to enable syncing')
      return
    }
    setSaving(true)
    try {
      await enableSpotifyPersistence(sessionId)
      onUpdate()
      onOpenChange(false)
      toast.success('Your Spotify login will now sync to this session')
    } catch {
      toast.error('Failed to enable Spotify login sync')
    } finally {
      setSaving(false)
    }
  }

  const handleDisable = async () => {
    setSaving(true)
    try {
      await disableSpotifyPersistence(sessionId)
      onUpdate()
      onOpenChange(false)
      toast.success('Spotify login sync disabled')
    } catch {
      toast.error('Failed to disable Spotify login sync')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sync Spotify Login</DialogTitle>
          <DialogDescription>
            Store your Spotify login with this session so it moves with you. When
            enabled, you can rejoin from another device without reconnecting to Spotify.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-4 text-sm">
          <div className="flex items-start gap-2 text-muted-foreground">
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Your login is encrypted with your session password before it leaves this
              device — the server can never read it.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4 shrink-0" />
            <span>
              Status:{' '}
              <strong>{enabled ? 'Syncing to this session' : 'Not syncing'}</strong>
            </span>
          </div>
        </div>

        <DialogFooter>
          {enabled ? (
            <Button variant="outline" onClick={handleDisable} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Disable Sync
            </Button>
          ) : (
            <Button onClick={handleEnable} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enable Sync
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Music, Share2, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AdminSettings } from '@/components/AdminSettings'
import { useAuthStore } from '@/stores/authStore'
import type { Session } from '@/types'

export function SessionHeader({
  session,
  serviceStatus,
}: {
  session: Session
  serviceStatus?: ReactNode
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isAdmin, friendAccessKey, logout } = useAuthStore()
  const [copiedKey, setCopiedKey] = useState(false)

  const handleCopyKey = () => {
    if (friendAccessKey) {
      navigator.clipboard.writeText(friendAccessKey)
      setCopiedKey(true)
      setTimeout(() => setCopiedKey(false), 2000)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">{session.displayName}</h1>
            {isAdmin && <Badge variant="secondary">Admin</Badge>}
          </div>
          <div className="flex items-center gap-2">
            {serviceStatus}
            {isAdmin && friendAccessKey && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyKey}
                className="flex items-center gap-1"
              >
                <Share2 className="h-4 w-4" />
                <span className="hidden sm:inline">{copiedKey ? 'Copied!' : friendAccessKey}</span>
                <span className="sm:hidden">{copiedKey ? 'Copied!' : 'Share'}</span>
              </Button>
            )}
            {isAdmin && (
              <AdminSettings
                session={session}
                onSessionUpdate={() => queryClient.invalidateQueries({ queryKey: ['session', session.id] })}
              />
            )}
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}

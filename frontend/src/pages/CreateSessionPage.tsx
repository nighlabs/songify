/**
 * Create session page - Admin creates a new playlist session.
 *
 * Collects:
 * - Session name (display name shown to friends)
 * - Admin name (e.g., "DJ Chris")
 * - Password (used to rejoin as admin later)
 *
 * On success:
 * - Generates a BIP39-style friend access key
 * - Returns JWT token for admin
 * - Redirects to session page
 */

import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Plus, ArrowLeft, Music } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { api } from '@/services/api'
import { hashPassword } from '@/services/crypto'
import { useAuthStore } from '@/stores/authStore'

export function CreateSessionPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const setAdminAuth = useAuthStore((state) => state.setAdminAuth)

  const portalPasswordHash = (location.state as { portalPasswordHash?: string } | null)?.portalPasswordHash

  // Redirect to admin portal if no portal password hash in navigation state
  useEffect(() => {
    if (!portalPasswordHash) {
      navigate('/admin', { replace: true })
    }
  }, [portalPasswordHash, navigate])

  const [displayName, setDisplayName] = useState('')
  const [adminName, setAdminName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [musicService, setMusicService] = useState<'spotify' | 'youtube'>('spotify')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!displayName || !adminName || !password) {
      setError('Please fill in all required fields')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 4) {
      setError('Password must be at least 4 characters')
      return
    }

    setLoading(true)
    setError('')

    try {
      const passwordHash = await hashPassword(password, adminName)
      const response = await api.createSession({
        displayName,
        adminName,
        adminPasswordHash: passwordHash,
        adminPortalPasswordHash: portalPasswordHash!,
        musicService,
      })

      setAdminAuth(
        response.token,
        response.sessionId,
        displayName,
        response.friendAccessKey
      )
      navigate(`/session/${response.sessionId}`)
    } catch {
      setError('Failed to create session')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-violet-50 to-pink-50">
      <div className="w-full max-w-md space-y-8">
        <Button
          variant="ghost"
          onClick={() => navigate('/admin')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create Session
            </CardTitle>
            <CardDescription>
              Set up a new playlist session for your friends
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Session Name</Label>
                <Input
                  id="displayName"
                  placeholder="e.g., Friday Night Party"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Music Service</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={musicService === 'spotify' ? 'default' : 'outline'}
                    className={musicService === 'spotify' ? 'bg-green-600 hover:bg-green-700 flex-1' : 'flex-1'}
                    onClick={() => setMusicService('spotify')}
                  >
                    <Music className="h-4 w-4 mr-2" />
                    Spotify
                  </Button>
                  <Button
                    type="button"
                    variant={musicService === 'youtube' ? 'default' : 'outline'}
                    className={musicService === 'youtube' ? 'bg-red-600 hover:bg-red-700 flex-1' : 'flex-1'}
                    onClick={() => setMusicService('youtube')}
                  >
                    <Music className="h-4 w-4 mr-2" />
                    YouTube
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminName">Your Name</Label>
                <Input
                  id="adminName"
                  placeholder="e.g., DJ Chris"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Choose a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  You'll need this to rejoin as admin later
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Creating...' : 'Create Session'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

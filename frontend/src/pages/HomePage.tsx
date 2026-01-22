/**
 * Home page - Entry point for friends joining a session.
 *
 * Users enter the BIP39-style access key (e.g., "happy tiger 42")
 * shared by the session admin. The key is hashed before transmission.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Music, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { api } from '@/services/api'
import { hashFriendKey } from '@/services/crypto'
import { useAuthStore } from '@/stores/authStore'

export function HomePage() {
  const navigate = useNavigate()
  const setFriendAuth = useAuthStore((state) => state.setFriendAuth)
  const [friendKey, setFriendKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    const sanitizedKey = friendKey.trim().toLowerCase()
    setFriendKey(sanitizedKey)

    if (!sanitizedKey) {
      setError('Please enter an access key')
      return
    }

    setLoading(true)
    setError('')

    try {
      const friendKeyHash = await hashFriendKey(sanitizedKey)
      const response = await api.joinSession(friendKeyHash)
      setFriendAuth(response.token, response.sessionId, response.displayName)
      navigate(`/session/${response.sessionId}`)
    } catch {
      setError('Invalid access key. Please check and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-violet-50 to-pink-50">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Music className="h-10 w-10 text-primary" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-violet-600 to-pink-600 bg-clip-text text-transparent">
              Songify
            </h1>
          </div>
          <p className="text-muted-foreground">
            Request songs for the playlist
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Join a Session
            </CardTitle>
            <CardDescription>
              Enter the access key shared by your host
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="friendKey">Access Key</Label>
                <Input
                  id="friendKey"
                  placeholder="e.g., happy-tiger-42"
                  value={friendKey}
                  onChange={(e) => setFriendKey(e.target.value)}
                  className="text-center text-lg"
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Joining...' : 'Join Session'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center">
          <Button variant="link" onClick={() => navigate('/admin')}>
            Admin Portal
          </Button>
        </div>
      </div>
    </div>
  )
}

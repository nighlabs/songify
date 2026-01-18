import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { api } from '@/services/api'
import { hashPassword } from '@/services/crypto'
import { useAuthStore } from '@/stores/authStore'

export function RejoinSessionPage() {
  const navigate = useNavigate()
  const setAdminAuth = useAuthStore((state) => state.setAdminAuth)

  const [friendAccessKey, setFriendAccessKey] = useState('')
  const [adminName, setAdminName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!friendAccessKey || !adminName || !password) {
      setError('Please fill in all fields')
      return
    }

    setLoading(true)
    setError('')

    try {
      const passwordHash = await hashPassword(password, adminName)
      const response = await api.rejoinSession(friendAccessKey, passwordHash)

      setAdminAuth(
        response.token,
        response.sessionId,
        response.displayName,
        response.friendAccessKey
      )
      navigate(`/session/${response.sessionId}`)
    } catch {
      setError('Invalid credentials. Please check your access key, name, and password.')
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
              <LogIn className="h-5 w-5" />
              Rejoin Session
            </CardTitle>
            <CardDescription>
              Sign back into your existing session using your friend access key
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="friendAccessKey">Friend Access Key</Label>
                <Input
                  id="friendAccessKey"
                  placeholder="e.g., happy-tiger-42"
                  value={friendAccessKey}
                  onChange={(e) => setFriendAccessKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The key you shared with friends to join the session
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminName">Your Name</Label>
                <Input
                  id="adminName"
                  placeholder="Enter your admin name"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in...' : 'Rejoin Session'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

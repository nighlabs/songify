import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { api } from '@/services/api'
import { hashPassword } from '@/services/crypto'

export function AdminPortalPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) {
      setError('Please enter the admin password')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Use UTC day of month as salt for the hash
      const utcDay = new Date().getUTCDate().toString()
      const passwordHash = await hashPassword(password, utcDay)
      const response = await api.verifyAdminPassword(passwordHash)
      if (response.valid) {
        navigate('/admin/create')
      } else {
        setError('Invalid password')
      }
    } catch {
      setError('Failed to verify password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-violet-50 to-pink-50">
      <div className="w-full max-w-md space-y-8">
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Admin Portal
            </CardTitle>
            <CardDescription>
              Enter the admin password to create or manage sessions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Admin Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Verifying...' : 'Continue'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center">
          <Button variant="link" onClick={() => navigate('/admin/rejoin')}>
            Rejoin existing session
          </Button>
        </div>
      </div>
    </div>
  )
}

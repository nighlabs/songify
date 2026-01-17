import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { handleSpotifyCallback } from '@/services/spotify'
import { useAuthStore } from '@/stores/authStore'

export function SpotifyCallbackPage() {
  const navigate = useNavigate()
  const sessionId = useAuthStore((state) => state.sessionId)

  useEffect(() => {
    const processCallback = async () => {
      try {
        await handleSpotifyCallback()
        if (sessionId) {
          navigate(`/session/${sessionId}`)
        } else {
          navigate('/')
        }
      } catch (e) {
        console.error('Spotify callback error:', e)
        navigate('/')
      }
    }

    processCallback()
  }, [navigate, sessionId])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
      <p className="text-muted-foreground">Connecting to Spotify...</p>
    </div>
  )
}

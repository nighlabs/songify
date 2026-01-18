import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Music, Plus, Check } from 'lucide-react'
import { handleSpotifyCallback, getUserPlaylists, createPlaylist } from '@/services/spotify'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/services/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type SpotifyPlaylist = {
  id: string
  name: string
  images: { url: string }[]
}

type State = 'authenticating' | 'selecting' | 'saving' | 'error'

export function SpotifyCallbackPage() {
  const navigate = useNavigate()
  const sessionId = useAuthStore((state) => state.sessionId)
  const [state, setState] = useState<State>('authenticating')
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([])
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null)
  const [showNewPlaylist, setShowNewPlaylist] = useState(false)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const processCallback = async () => {
      try {
        await handleSpotifyCallback()
        const userPlaylists = await getUserPlaylists()
        setPlaylists(userPlaylists)
        setState('selecting')
      } catch (e) {
        console.error('Spotify callback error:', e)
        setError('Failed to connect to Spotify')
        setState('error')
      }
    }

    processCallback()
  }, [])

  const handleSelectPlaylist = async (playlistId: string) => {
    if (!sessionId) {
      navigate('/')
      return
    }

    setSelectedPlaylistId(playlistId)
    setState('saving')

    try {
      await api.updateSessionPlaylist(sessionId, playlistId)
      navigate(`/session/${sessionId}`)
    } catch (e) {
      console.error('Failed to save playlist:', e)
      setError('Failed to save playlist selection')
      setState('error')
    }
  }

  const handleCreatePlaylist = async () => {
    if (!sessionId || !newPlaylistName.trim()) return

    setState('saving')

    try {
      const playlist = await createPlaylist(newPlaylistName.trim())
      await api.updateSessionPlaylist(sessionId, playlist.id)
      navigate(`/session/${sessionId}`)
    } catch (e) {
      console.error('Failed to create playlist:', e)
      setError('Failed to create playlist')
      setState('error')
    }
  }

  if (state === 'authenticating') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Connecting to Spotify...</p>
      </div>
    )
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Connection Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/')} className="w-full">
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (state === 'saving') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Saving playlist selection...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Select a Playlist</CardTitle>
          <CardDescription>
            Choose where approved songs will be added
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!showNewPlaylist ? (
            <>
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => setShowNewPlaylist(true)}
              >
                <Plus className="h-4 w-4" />
                Create new playlist
              </Button>

              <div className="max-h-64 overflow-y-auto space-y-2">
                {playlists.map((playlist) => (
                  <button
                    key={playlist.id}
                    onClick={() => handleSelectPlaylist(playlist.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors hover:bg-accent ${
                      selectedPlaylistId === playlist.id ? 'border-primary bg-accent' : 'border-input'
                    }`}
                  >
                    {playlist.images && playlist.images[0] ? (
                      <img
                        src={playlist.images[0].url}
                        alt={playlist.name}
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                        <Music className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <span className="flex-1 text-left truncate">{playlist.name}</span>
                    {selectedPlaylistId === playlist.id && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </button>
                ))}
              </div>

              {playlists.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-4">
                  No playlists found. Create a new one to get started.
                </p>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <Input
                placeholder="Playlist name"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setShowNewPlaylist(false)
                    setNewPlaylistName('')
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleCreatePlaylist}
                  disabled={!newPlaylistName.trim()}
                >
                  Create
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

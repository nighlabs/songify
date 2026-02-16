import { useState, useRef, useCallback } from 'react'
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  Tv,
  Unplug,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useClickOutside } from '@/hooks/useClickOutside'
import type { LoungeStatus } from '@/types'

/**
 * YouTube TV connection status indicator in the header.
 *
 * States:
 * - Disconnected: Red "Connect TV" button -> opens inline pairing code input
 * - Connecting: Blue loading spinner
 * - Connected: Green badge with TV icon + screenName, dropdown with disconnect option
 * - Error: Amber badge with error message, dropdown with reconnect option
 */
export function YouTubeStatus({
  loungeStatus,
  onPair,
  onDisconnect,
  onReconnect,
  isPairing,
  isReconnecting,
}: {
  loungeStatus: LoungeStatus | undefined
  onPair: (code: string) => void
  onDisconnect: () => void
  onReconnect: () => void
  isPairing: boolean
  isReconnecting: boolean
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [pairingInput, setPairingInput] = useState('')
  const [showPairingInput, setShowPairingInput] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useClickOutside(dropdownRef, useCallback(() => {
    setDropdownOpen(false)
    setShowPairingInput(false)
  }, []))

  const status = loungeStatus?.status ?? 'disconnected'

  const handlePair = () => {
    const code = pairingInput.replace(/\D/g, '')
    if (code) {
      onPair(code)
      setPairingInput('')
      setShowPairingInput(false)
    }
  }

  if (status === 'connecting' || isPairing || isReconnecting) {
    return (
      <div className="h-8 w-8 rounded bg-blue-100 flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
      </div>
    )
  }

  if (status === 'disconnected') {
    return (
      <div className="relative" ref={dropdownRef}>
        <Button
          size="sm"
          onClick={() => setShowPairingInput(!showPairingInput)}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          <Tv className="h-4 w-4 mr-1" />
          Connect TV
        </Button>

        {showPairingInput && (
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border p-3 z-20">
            <p className="text-sm font-medium mb-2">Enter TV pairing code</p>
            <div className="flex gap-2">
              <Input
                placeholder="Pairing code..."
                value={pairingInput}
                onChange={(e) => setPairingInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handlePair()}
                autoFocus
              />
              <Button size="sm" onClick={handlePair} disabled={!pairingInput.replace(/\D/g, '')}>
                Pair
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="flex items-center gap-2 px-2 py-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors"
        >
          <div className="h-7 w-7 rounded bg-amber-500 flex items-center justify-center">
            <AlertTriangle className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-medium text-amber-800 max-w-[150px] truncate">
            Reconnect
          </span>
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border py-1 z-20">
            <div className="px-3 py-2 border-b">
              <p className="text-xs text-amber-600 font-medium">TV Disconnected</p>
              <p className="text-sm text-muted-foreground mt-1">
                {loungeStatus?.error || 'Connection lost'}
              </p>
            </div>
            <button
              onClick={() => {
                setDropdownOpen(false)
                onReconnect()
              }}
              className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-muted transition-colors text-amber-700 font-medium"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Reconnect TV</span>
            </button>
            <button
              onClick={() => {
                setDropdownOpen(false)
                onDisconnect()
              }}
              className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-muted transition-colors text-red-600"
            >
              <Unplug className="h-4 w-4" />
              <span>Disconnect</span>
            </button>
          </div>
        )}
      </div>
    )
  }

  // Connected state
  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-2 px-2 py-1 rounded-lg border border-green-200 bg-green-50 hover:bg-green-100 transition-colors"
      >
        <div className="h-7 w-7 rounded bg-green-600 flex items-center justify-center">
          <Tv className="h-4 w-4 text-white" />
        </div>
        <span className="text-sm font-medium text-green-800 max-w-[150px] truncate">
          {loungeStatus?.screenName || 'TV Connected'}
        </span>
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border py-1 z-20">
          <div className="px-3 py-2 border-b">
            <p className="text-xs text-muted-foreground">Connected TV</p>
            <p className="font-medium truncate">{loungeStatus?.screenName || 'YouTube TV'}</p>
          </div>
          <button
            onClick={() => {
              setDropdownOpen(false)
              onDisconnect()
            }}
            className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-muted transition-colors text-red-600"
          >
            <Unplug className="h-4 w-4" />
            <span>Disconnect</span>
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Admin settings dropdown menu.
 *
 * Provides access to session configuration:
 * - Song time limit (maximum duration)
 * - Prohibition patterns (block artists/titles)
 * - Archive all requests (clear queue)
 *
 * Each setting opens a dialog for detailed configuration.
 */

import { useState, useRef, useEffect } from 'react'
import { Settings, Clock, Ban, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TimeLimitDialog } from '@/components/TimeLimitDialog'
import { PatternsDialog } from '@/components/PatternsDialog'
import { ArchiveDialog } from '@/components/ArchiveDialog'
import type { Session } from '@/types'

interface AdminSettingsProps {
  session: Session
  onSessionUpdate: () => void  // Called after any setting change
}

export function AdminSettings({ session, onSessionUpdate }: AdminSettingsProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [timeLimitOpen, setTimeLimitOpen] = useState(false)
  const [patternsOpen, setPatternsOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setDropdownOpen(!dropdownOpen)}
        >
          <Settings className="h-4 w-4" />
        </Button>

        {dropdownOpen && (
          <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border py-1 z-20">
            <div className="px-3 py-2 border-b">
              <p className="font-medium text-sm">Session Settings</p>
            </div>
            <button
              onClick={() => {
                setDropdownOpen(false)
                setTimeLimitOpen(true)
              }}
              className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-muted transition-colors"
            >
              <Clock className="h-4 w-4" />
              <div>
                <span>Song Time Limit</span>
                {session.songDurationLimitMs && (
                  <p className="text-xs text-muted-foreground">
                    {Math.floor(session.songDurationLimitMs / 60000)}m{' '}
                    {Math.floor((session.songDurationLimitMs % 60000) / 1000)}s
                  </p>
                )}
              </div>
            </button>
            <button
              onClick={() => {
                setDropdownOpen(false)
                setPatternsOpen(true)
              }}
              className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-muted transition-colors"
            >
              <Ban className="h-4 w-4" />
              <div>
                <span>Prohibition Patterns</span>
                {session.prohibitedPatterns && session.prohibitedPatterns.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {session.prohibitedPatterns.length} pattern{session.prohibitedPatterns.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            </button>
            <div className="border-t my-1" />
            <button
              onClick={() => {
                setDropdownOpen(false)
                setArchiveOpen(true)
              }}
              className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-muted transition-colors text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              <span>Archive All Requests</span>
            </button>
          </div>
        )}
      </div>

      <TimeLimitDialog
        open={timeLimitOpen}
        onOpenChange={setTimeLimitOpen}
        sessionId={session.id}
        currentLimitMs={session.songDurationLimitMs}
        onUpdate={onSessionUpdate}
      />

      <PatternsDialog
        open={patternsOpen}
        onOpenChange={setPatternsOpen}
        sessionId={session.id}
        patterns={session.prohibitedPatterns || []}
        onUpdate={onSessionUpdate}
      />

      <ArchiveDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        sessionId={session.id}
        onUpdate={onSessionUpdate}
      />
    </>
  )
}

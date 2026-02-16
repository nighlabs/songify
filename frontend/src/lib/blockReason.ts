import type { ProhibitedPattern } from '@/types'
import { formatDuration } from '@/lib/utils'

interface BlockReasonItem {
  title: string
  artists?: string[]
  durationMs: number
}

export function getBlockReason(
  item: BlockReasonItem,
  prohibitedPatterns: ProhibitedPattern[] | undefined,
  songDurationLimitMs: number | undefined
): string | null {
  // Check duration limit
  if (songDurationLimitMs && item.durationMs > songDurationLimitMs) {
    return `Song exceeds ${formatDuration(songDurationLimitMs)} time limit`
  }

  // Check prohibited patterns (case-insensitive substring match)
  for (const p of prohibitedPatterns || []) {
    if (
      p.patternType === 'artist' &&
      item.artists?.some((a) => a.toLowerCase().includes(p.pattern.toLowerCase()))
    ) {
      return `Artist matches prohibited pattern "${p.pattern}"`
    }
    if (
      p.patternType === 'title' &&
      item.title.toLowerCase().includes(p.pattern.toLowerCase())
    ) {
      return `Title matches prohibited pattern "${p.pattern}"`
    }
  }

  return null
}

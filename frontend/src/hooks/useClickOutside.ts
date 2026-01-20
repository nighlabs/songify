import { useEffect, type RefObject } from 'react'

/**
 * Hook that triggers a callback when clicking outside of the referenced element.
 * Useful for closing dropdowns, modals, etc.
 */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onClickOutside: () => void
) {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClickOutside()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [ref, onClickOutside])
}

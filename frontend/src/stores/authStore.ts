/**
 * Global authentication state store using Zustand.
 *
 * Persisted to localStorage under 'songify-auth' key.
 * This allows users to refresh the page without losing their session.
 *
 * Two user types:
 * - Admin: Creates sessions, approves/rejects requests, has friendAccessKey
 * - Friend: Joins sessions, submits song requests
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthState } from '@/types'

interface AuthStore extends AuthState {
  /** Partial state update (for flexibility) */
  setAuth: (auth: Partial<AuthState>) => void
  /** Set auth state after admin creates or rejoins a session */
  setAdminAuth: (token: string, sessionId: string, displayName: string, friendAccessKey: string) => void
  /** Set auth state after friend joins a session */
  setFriendAuth: (token: string, sessionId: string, displayName: string) => void
  /** Clear all auth state on logout */
  logout: () => void
  /** Check if user has a valid token */
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      // Initial state - not authenticated
      token: null,
      sessionId: null,
      isAdmin: false,
      displayName: null,
      friendAccessKey: null,

      setAuth: (auth) => set((state) => ({ ...state, ...auth })),

      setAdminAuth: (token, sessionId, displayName, friendAccessKey) =>
        set({
          token,
          sessionId,
          isAdmin: true,
          displayName,
          friendAccessKey,
        }),

      setFriendAuth: (token, sessionId, displayName) =>
        set({
          token,
          sessionId,
          isAdmin: false,
          displayName,
          friendAccessKey: null,
        }),

      logout: () =>
        set({
          token: null,
          sessionId: null,
          isAdmin: false,
          displayName: null,
          friendAccessKey: null,
        }),

      isAuthenticated: () => !!get().token,
    }),
    {
      name: 'songify-auth',  // localStorage key
    }
  )
)

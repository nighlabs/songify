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
  /** Set auth state after admin creates or rejoins a session */
  setAdminAuth: (token: string, sessionId: string, displayName: string, friendAccessKey: string) => void
  /** Set auth state after friend joins a session */
  setFriendAuth: (token: string, sessionId: string, displayName: string, identity: string) => void
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
      identity: null,
      friendAccessKey: null,

      setAdminAuth: (token, sessionId, displayName, friendAccessKey) =>
        set({
          token,
          sessionId,
          isAdmin: true,
          displayName,
          identity: null,
          friendAccessKey,
        }),

      setFriendAuth: (token, sessionId, displayName, identity) =>
        set({
          token,
          sessionId,
          isAdmin: false,
          displayName,
          identity,
          friendAccessKey: null,
        }),

      logout: () =>
        set({
          token: null,
          sessionId: null,
          isAdmin: false,
          displayName: null,
          identity: null,
          friendAccessKey: null,
        }),

      isAuthenticated: () => !!get().token,
    }),
    {
      name: 'songify-auth',  // localStorage key
    }
  )
)

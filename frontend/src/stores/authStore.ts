import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthState } from '@/types'

interface AuthStore extends AuthState {
  setAuth: (auth: Partial<AuthState>) => void
  setAdminAuth: (token: string, sessionId: string, displayName: string, friendAccessKey: string) => void
  setFriendAuth: (token: string, sessionId: string, displayName: string) => void
  logout: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
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
      name: 'songify-auth',
    }
  )
)

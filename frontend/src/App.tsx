/**
 * Root application component.
 *
 * Sets up:
 * - React Query for data fetching and caching
 * - React Router for client-side routing
 * - Sonner toast notifications
 *
 * Route structure:
 * - /              : Friend join page (enter access key)
 * - /admin         : Admin portal password entry
 * - /admin/create  : Create new session form
 * - /admin/rejoin  : Rejoin existing session form
 * - /session/:id   : Main session page (search, requests, approval)
 * - /callback      : Spotify OAuth callback handler
 */

import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { HomePage } from '@/pages/HomePage'
import { AdminPortalPage } from '@/pages/AdminPortalPage'
import { CreateSessionPage } from '@/pages/CreateSessionPage'
import { RejoinSessionPage } from '@/pages/RejoinSessionPage'
import { SessionPage } from '@/pages/SessionPage'
import { SpotifyCallbackPage } from '@/pages/SpotifyCallbackPage'

/**
 * React Query client configuration.
 * - staleTime: Data considered fresh for 1 minute
 * - retry: Only retry failed requests once
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/admin" element={<AdminPortalPage />} />
          <Route path="/admin/create" element={<CreateSessionPage />} />
          <Route path="/admin/rejoin" element={<RejoinSessionPage />} />

          {/* Protected routes (require auth token) */}
          <Route path="/session/:id" element={<SessionPage />} />
          <Route path="/callback" element={<SpotifyCallbackPage />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" />
    </QueryClientProvider>
  )
}

export default App

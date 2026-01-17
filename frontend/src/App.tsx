import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { HomePage } from '@/pages/HomePage'
import { AdminPortalPage } from '@/pages/AdminPortalPage'
import { CreateSessionPage } from '@/pages/CreateSessionPage'
import { RejoinSessionPage } from '@/pages/RejoinSessionPage'
import { SessionPage } from '@/pages/SessionPage'
import { SpotifyCallbackPage } from '@/pages/SpotifyCallbackPage'

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
          <Route path="/" element={<HomePage />} />
          <Route path="/admin" element={<AdminPortalPage />} />
          <Route path="/admin/create" element={<CreateSessionPage />} />
          <Route path="/admin/rejoin" element={<RejoinSessionPage />} />
          <Route path="/session/:id" element={<SessionPage />} />
          <Route path="/callback" element={<SpotifyCallbackPage />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" />
    </QueryClientProvider>
  )
}

export default App

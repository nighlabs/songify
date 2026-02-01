import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { getConfig } from '@/services/config'
import { initSentry } from '@/lib/sentry'

async function bootstrap() {
  try {
    const config = await getConfig()
    if (config.sentryDsn) {
      initSentry(config.sentryDsn, config.sentryEnvironment ?? 'production')
    }
  } catch {
    // Config fetch failed — continue without Sentry
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

bootstrap()

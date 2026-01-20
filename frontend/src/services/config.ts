/**
 * Runtime configuration fetched from the backend.
 * Contains public configuration values like the Spotify client ID.
 *
 * The config is fetched once and cached for the session lifetime.
 * This allows the frontend to be deployed without hardcoding
 * environment-specific values.
 */

export interface AppConfig {
  spotifyClientId: string  // Spotify OAuth client ID for the app
}

/** Cached config to avoid repeated API calls */
let cachedConfig: AppConfig | null = null

/**
 * Fetch configuration from the backend API.
 * Returns cached value if already fetched.
 */
export async function getConfig(): Promise<AppConfig> {
  if (cachedConfig) {
    return cachedConfig
  }

  const response = await fetch('/api/config')
  if (!response.ok) {
    throw new Error('Failed to fetch configuration')
  }

  cachedConfig = await response.json()
  return cachedConfig!
}

/**
 * Get cached config without making an API call.
 * Returns null if config hasn't been fetched yet.
 */
export function getCachedConfig(): AppConfig | null {
  return cachedConfig
}

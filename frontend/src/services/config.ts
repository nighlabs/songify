export interface AppConfig {
  spotifyClientId: string
}

let cachedConfig: AppConfig | null = null

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

export function getCachedConfig(): AppConfig | null {
  return cachedConfig
}

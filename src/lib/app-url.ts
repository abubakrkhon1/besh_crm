import 'server-only'

const DEVELOPMENT_ORIGIN = 'http://localhost:3000'
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

export function validateApplicationBaseUrl(
  configuredUrl: string | undefined,
  environment = process.env.NODE_ENV,
): string {
  if (!configuredUrl) {
    if (environment !== 'production') return DEVELOPMENT_ORIGIN
    throw new Error('NEXT_PUBLIC_APP_URL is required in production.')
  }

  let url: URL
  try {
    url = new URL(configuredUrl)
  } catch {
    throw new Error('NEXT_PUBLIC_APP_URL must be a valid absolute URL.')
  }

  const isDevelopmentLoopback = environment !== 'production'
    && url.protocol === 'http:'
    && LOOPBACK_HOSTS.has(url.hostname)
  if (url.protocol !== 'https:' && !isDevelopmentLoopback) {
    throw new Error('NEXT_PUBLIC_APP_URL must use HTTPS.')
  }
  if (url.username || url.password) {
    throw new Error('NEXT_PUBLIC_APP_URL must not contain credentials.')
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('NEXT_PUBLIC_APP_URL must contain only an origin.')
  }

  return url.origin
}

export function getApplicationBaseUrl(): string {
  return validateApplicationBaseUrl(process.env.NEXT_PUBLIC_APP_URL)
}

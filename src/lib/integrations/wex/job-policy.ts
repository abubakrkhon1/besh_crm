import { WexError } from './errors'

const RETRY_DELAYS_SECONDS = [60, 300, 900, 1_800]

export function retryDelaySeconds(attempt: number, random: () => number = Math.random) {
  const base = RETRY_DELAYS_SECONDS[Math.min(Math.max(attempt - 1, 0), RETRY_DELAYS_SECONDS.length - 1)]
  const jitterCeiling = Math.min(60, Math.max(5, base * 0.1))
  return base + Math.floor(random() * jitterCeiling)
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : 'WEX synchronization failed.'
  return message.replace(/\b\d{8,}\b/g, '[redacted]').slice(0, 1_000)
}

export function classifyWexJobError(error: unknown) {
  if (error instanceof WexError) return { code: error.kind, retryable: error.retryable, message: safeError(error) }
  return { code: 'unexpected', retryable: true, message: safeError(error) }
}

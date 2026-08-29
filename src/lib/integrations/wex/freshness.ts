export type WexSyncResource = 'transactions' | 'account' | 'reconciliation'
export type WexFreshnessStatus = 'current' | 'stale' | 'missing'

export const WEX_FRESHNESS_THRESHOLDS_MS: Record<WexSyncResource, number> = {
  transactions: 15 * 60 * 1000,
  account: 45 * 60 * 1000,
  reconciliation: 26 * 60 * 60 * 1000,
}

export function getWexFreshness(
  resource: WexSyncResource,
  lastSucceededAt: string | null | undefined,
  now = Date.now(),
) {
  if (!lastSucceededAt) return { status: 'missing' as const, ageMs: null }

  const succeededAt = Date.parse(lastSucceededAt)
  if (!Number.isFinite(succeededAt)) return { status: 'missing' as const, ageMs: null }

  const ageMs = Math.max(0, now - succeededAt)
  return {
    status: ageMs <= WEX_FRESHNESS_THRESHOLDS_MS[resource]
      ? 'current' as const
      : 'stale' as const,
    ageMs,
  }
}


'use client'

import { useEffect } from 'react'
import { ensureWexSyncFresh } from '@/app/actions/fuel-cards'

export function WexFreshnessTrigger() {
  useEffect(() => {
    void ensureWexSyncFresh()
  }, [])
  return null
}

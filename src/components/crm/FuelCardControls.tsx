'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { RefreshCw, RotateCcw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { executeWexSync, startWexSync } from '@/app/actions/fuel-cards'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Progress } from '@/components/ui/progress'

type SyncRunResponse = {
  ok: boolean
  status: 'running' | 'succeeded' | 'failed'
  metadata?: Record<string, unknown>
  errorMessage?: string | null
}

type SyncProgress = {
  value: number
  ceiling: number
  title: string
  description: string
  status: 'running' | 'succeeded' | 'failed'
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const numericValue = (value: unknown) => typeof value === 'number' ? value : Number(value) || 0

function displayProgress(run: SyncRunResponse): SyncProgress {
  const metadata = run.metadata ?? {}
  const stage = typeof metadata.stage === 'string' ? metadata.stage : 'queued'

  if (run.status === 'failed') {
    return {
      value: 100,
      ceiling: 100,
      title: 'Synchronization stopped',
      description: run.errorMessage || 'WEX data could not be synchronized. Please try again.',
      status: 'failed',
    }
  }

  if (run.status === 'succeeded' || stage === 'completed') {
    return {
      value: 100,
      ceiling: 100,
      title: 'Synchronization complete',
      description: 'Your WEX customers, fuel cards, and transactions are up to date.',
      status: 'succeeded',
    }
  }

  if (stage === 'authenticated') {
    return { value: 12, ceiling: 24, title: 'Connected to WEX', description: 'Loading cards and recent transactions…', status: 'running' }
  }

  if (stage === 'cards_fetched') {
    const cards = numericValue(metadata.cardsReceived)
    return { value: 25, ceiling: 30, title: 'Fuel cards received', description: `${cards.toLocaleString()} cards received. Loading transaction activity…`, status: 'running' }
  }

  if (stage === 'transactions_window_fetched') {
    const request = numericValue(metadata.request)
    const totalRequests = Math.max(numericValue(metadata.totalRequests), 1)
    const transactions = numericValue(metadata.transactionsReceived)
    const value = Math.min(55, 25 + Math.round((request / totalRequests) * 30))
    return {
      value,
      ceiling: Math.min(62, value + 5),
      title: 'Loading WEX transactions',
      description: `Date batch ${request} of ${totalRequests} · ${transactions.toLocaleString()} transactions received`,
      status: 'running',
    }
  }

  if (stage === 'customers_saved') {
    const customers = numericValue(metadata.customersReceived)
    return { value: 65, ceiling: 78, title: 'Customers updated', description: `${customers.toLocaleString()} WEX customer records processed. Saving cards…`, status: 'running' }
  }

  if (stage === 'cards_saved') {
    const cards = numericValue(metadata.cardsSaved)
    return { value: 80, ceiling: 90, title: 'Fuel cards updated', description: `${cards.toLocaleString()} cards processed. Saving transactions…`, status: 'running' }
  }

  if (stage === 'transactions_saved') {
    const transactions = numericValue(metadata.transactionsSaved)
    return { value: 92, ceiling: 98, title: 'Transactions updated', description: `${transactions.toLocaleString()} transactions processed. Verifying synchronized data…`, status: 'running' }
  }

  return { value: 4, ceiling: 11, title: 'Starting WEX synchronization', description: 'Preparing a secure connection to WEX…', status: 'running' }
}

async function fetchSyncProgress(runId: string) {
  const response = await fetch(`/api/wex-sync/${runId}`, { cache: 'no-store' })
  if (!response.ok) return null
  return response.json() as Promise<SyncRunResponse>
}

function SyncToastProgress({ progress, description }: { progress: SyncProgress, description?: string }) {
  const [displayedValue, setDisplayedValue] = useState(progress.value)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setDisplayedValue((current) => {
        const destination = progress.status === 'running' ? progress.ceiling : progress.value
        const remaining = destination - current
        if (remaining <= 0.05) return destination

        const minimumStep = progress.status === 'running' ? 0.04 : 0.6
        const maximumStep = progress.status === 'running' ? 0.32 : 1.5
        const step = Math.min(maximumStep, Math.max(minimumStep, remaining * 0.045))
        return Math.min(destination, current + step)
      })
    }, 80)

    return () => window.clearInterval(timer)
  }, [progress.ceiling, progress.status, progress.value])

  const roundedValue = Math.round(displayedValue)

  return (
    <div className="flex w-full flex-col gap-2">
      <span>{description ?? progress.description}</span>
      <div className="flex items-center gap-3">
        <Progress value={displayedValue} aria-label="WEX synchronization progress" className="flex-1" />
        <span className="min-w-9 text-right font-medium tabular-nums">{roundedValue}%</span>
      </div>
    </div>
  )
}

export function FuelCardSyncButton({ label = 'Sync All WEX Data' }: { label?: string } = {}) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)

  const sync = async () => {
    setSyncing(true)
    const startingProgress = displayProgress({ ok: true, status: 'running', metadata: { stage: 'queued' } })
    const toastId = toast.loading(startingProgress.title, {
      description: <SyncToastProgress progress={startingProgress} />,
      duration: Infinity,
      closeButton: false,
    })

    try {
      const started = await startWexSync({ confirm: true })
      if (!started.ok) {
        toast.error('WEX synchronization could not start', {
          id: toastId,
          description: started.message,
          duration: 6000,
          closeButton: true,
        })
        return
      }

      const execution = executeWexSync({ runId: started.runId })
      const nextUpdate = () => Promise.race([
        execution.then((result) => ({ type: 'complete' as const, result })),
        wait(3_000).then(() => ({ type: 'poll' as const })),
      ])
      let update = await nextUpdate()
      let lastProgressValue = startingProgress.value

      while (update.type === 'poll') {
        const current = await fetchSyncProgress(started.runId)
        if (current?.ok) {
          const currentProgress = displayProgress(current)
          if (currentProgress.value !== lastProgressValue) {
            lastProgressValue = currentProgress.value
            toast.loading(currentProgress.title, {
              id: toastId,
              description: <SyncToastProgress progress={currentProgress} />,
              duration: Infinity,
              closeButton: false,
            })
          }
        }
        update = await nextUpdate()
      }

      const result = update.result
      if (result.ok) {
        const finalProgress = {
          value: 100,
          ceiling: 100,
          title: 'Synchronization complete',
          description: result.message,
          status: 'succeeded',
        } satisfies SyncProgress
        toast.success('WEX synchronization complete', {
          id: toastId,
          description: <SyncToastProgress progress={finalProgress} description={result.message} />,
          duration: 6000,
          closeButton: true,
        })
      } else {
        toast.error('Synchronization stopped', {
          id: toastId,
          description: result.message,
          duration: 6000,
          closeButton: true,
        })
      }
    } catch {
      const message = 'WEX data could not be synchronized. Please try again.'
      toast.error('WEX synchronization stopped', {
        id: toastId,
        description: message,
        duration: 6000,
        closeButton: true,
      })
    } finally {
      setSyncing(false)
      router.refresh()
    }
  }

  return (
      <Button type="button" size="lg" disabled={syncing} onClick={sync}>
        <RefreshCw data-icon="inline-start" className={syncing ? 'animate-spin' : undefined} />
        {syncing ? 'Synchronizing…' : label}
      </Button>
  )
}

type FuelCardFiltersProps = {
  statuses: string[]
  policies: string[]
  customers: Array<{ id: string; name: string }>
}

export function FuelCardFilters({ statuses, policies, customers }: FuelCardFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value && value !== 'all') next.set(key, value)
    else next.delete(key)
    next.delete('page')
    router.replace(`${pathname}?${next}`)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => set('q', q.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const clearFilters = () => {
    setQ('')
    const next = new URLSearchParams(params)
    ;['q', 'status', 'match', 'policy', 'customer', 'sync', 'page'].forEach((key) => next.delete(key))
    router.replace(`${pathname}?${next}`)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <Input value={q} onChange={(event) => setQ(event.target.value)} className="pl-9" placeholder="Search by card, driver, unit, or status…" aria-label="Search fuel cards" />
        </label>
        <Button type="button" variant="ghost" onClick={clearFilters}>
          <RotateCcw data-icon="inline-start" />
          Clear filters
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <NativeSelect value={params.get('status') ?? 'all'} onChange={(event) => set('status', event.target.value)} aria-label="Filter by card status">
          <NativeSelectOption value="all">All statuses</NativeSelectOption>
          {statuses.map((status) => <NativeSelectOption key={status} value={status}>{formatFilterLabel(status)}</NativeSelectOption>)}
        </NativeSelect>
        <NativeSelect value={params.get('match') ?? 'all'} onChange={(event) => set('match', event.target.value)} aria-label="Filter by match state">
          <NativeSelectOption value="all">All match states</NativeSelectOption>
          <NativeSelectOption value="matched">Matched</NativeSelectOption>
          <NativeSelectOption value="unmatched">Unmatched</NativeSelectOption>
        </NativeSelect>
        <NativeSelect value={params.get('policy') ?? 'all'} onChange={(event) => set('policy', event.target.value)} aria-label="Filter by policy">
          <NativeSelectOption value="all">All policies</NativeSelectOption>
          {policies.map((policy) => <NativeSelectOption key={policy} value={policy}>{policy}</NativeSelectOption>)}
        </NativeSelect>
        <NativeSelect value={params.get('customer') ?? 'all'} onChange={(event) => set('customer', event.target.value)} aria-label="Filter by customer">
          <NativeSelectOption value="all">All customers</NativeSelectOption>
          {customers.map((customer) => <NativeSelectOption key={customer.id} value={customer.id}>{customer.name}</NativeSelectOption>)}
        </NativeSelect>
        <NativeSelect value={params.get('sync') ?? 'all'} onChange={(event) => set('sync', event.target.value)} aria-label="Filter by synchronization state">
          <NativeSelectOption value="all">All sync states</NativeSelectOption>
          <NativeSelectOption value="current">Current</NativeSelectOption>
          <NativeSelectOption value="stale">Needs refresh</NativeSelectOption>
        </NativeSelect>
      </div>
    </div>
  )
}

function formatFilterLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

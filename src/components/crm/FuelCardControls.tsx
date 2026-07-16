'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { syncWexCards } from '@/app/actions/fuel-cards'
import { Button } from '@/components/ui/button'

export function FuelCardControls({ statuses }: { statuses: string[] }) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [pending, startTransition] = useTransition()
  const set = (key: string, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); next.delete('page'); router.replace(`${pathname}?${next}`) }
  useEffect(() => { const timer = setTimeout(() => set('q', q.trim()), 350); return () => clearTimeout(timer) }, [q]) // eslint-disable-line react-hooks/exhaustive-deps
  const sync = () => startTransition(async () => { const result = await syncWexCards({ confirm: true }); if (result.ok) toast.success(result.message); else toast.error(result.message); router.refresh() })
  return <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
    <label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-sm" placeholder="Search card, driver, unit, customer or status" /></label>
    <select className="h-9 rounded-lg border bg-background px-3 text-sm" value={params.get('status') ?? ''} onChange={(e) => set('status', e.target.value)}><option value="">All statuses</option>{statuses.map((s) => <option key={s}>{s}</option>)}</select>
    <select className="h-9 rounded-lg border bg-background px-3 text-sm" value={params.get('match') ?? 'all'} onChange={(e) => set('match', e.target.value)}><option value="all">All matches</option><option value="matched">Matched</option><option value="unmatched">Unmatched</option></select>
    <select className="h-9 rounded-lg border bg-background px-3 text-sm" value={params.get('sort') ?? 'status'} onChange={(e) => set('sort', e.target.value)}><option value="status">Status (active first)</option><option value="last_synced_at">Last synced</option><option value="driver_name">Driver</option><option value="unit_number">Unit</option></select>
    <Button disabled={pending} onClick={sync}><RefreshCw className={pending ? 'animate-spin' : ''} />{pending ? 'Syncing all WEX data…' : 'Sync All WEX Data'}</Button>
  </div>
}

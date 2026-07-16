import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { fuelCardQuerySchema } from '@/lib/integrations/wex/schemas'
import { FuelCardControls } from '@/components/crm/FuelCardControls'
import { TablePagination } from '@/components/crm/ui/TablePagination'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default async function FuelCardsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = fuelCardQuerySchema.parse(await searchParams), db = await createClient()
  let query: any = db.from('fuel_cards').select('id,card_last4,customer_id,driver_name,external_driver_id,unit_number,status,policy_number,is_overridden,last_synced_at,customers(company_name,contact_name)', { count: 'exact' }).eq('provider', 'wex_efs')
  if (p.status) query = query.eq('status', p.status)
  if (p.match === 'matched') query = query.not('customer_id', 'is', null)
  if (p.match === 'unmatched') query = query.is('customer_id', null)
  if (p.q) query = query.or(`card_last4.ilike.%${p.q.replace(/[%(),]/g, '')}%,driver_name.ilike.%${p.q.replace(/[%(),]/g, '')}%,external_driver_id.ilike.%${p.q.replace(/[%(),]/g, '')}%,unit_number.ilike.%${p.q.replace(/[%(),]/g, '')}%,status.ilike.%${p.q.replace(/[%(),]/g, '')}%`)
  const from = (p.page - 1) * p.pageSize
  query = query.order(p.sort, { ascending: p.dir === 'asc' })
  if (p.sort === 'status') query = query.order('last_synced_at', { ascending: false })
  const [{ data: cards, count, error }, { data: sync }, { data: statusRows }] = await Promise.all([query.range(from, from + p.pageSize - 1), db.from('fuel_card_sync_runs').select('completed_at,cards_received,cards_unmatched').eq('status', 'succeeded').order('completed_at', { ascending: false }).limit(1).maybeSingle(), db.from('fuel_cards').select('status').eq('provider', 'wex_efs')])
  const statuses = [...new Set((statusRows ?? []).map((x: any) => x.status))].sort() as string[]
  return <div className="space-y-6 pb-12"><div><h1 className="text-2xl font-semibold">Fuel Cards</h1><p className="text-sm text-muted-foreground">Securely synchronized WEX/EFS card inventory</p></div><FuelCardControls statuses={statuses} />
    {sync && <p className="text-xs text-muted-foreground">Last successful sync: {new Date(sync.completed_at!).toLocaleString()} · {sync.cards_received} received · {sync.cards_unmatched} unmatched</p>}
    {error ? <Card><CardContent className="p-6 text-destructive">Fuel cards could not be loaded.</CardContent></Card> : !cards?.length ? <Card><CardContent className="p-10 text-center text-muted-foreground">No fuel cards match the current filters.</CardContent></Card> : <Card className="overflow-x-auto py-0"><Table><TableHeader><TableRow><TableHead>Card</TableHead><TableHead>Customer</TableHead><TableHead>Driver</TableHead><TableHead>Driver ID</TableHead><TableHead>Unit</TableHead><TableHead>Status</TableHead><TableHead>Policy</TableHead><TableHead>Override</TableHead><TableHead>Last synced</TableHead><TableHead>Match</TableHead></TableRow></TableHeader><TableBody>{cards.map((c: any) => <TableRow key={c.id}><TableCell><Link className="font-mono font-medium hover:underline" href={`/crm/fuel-cards/${c.id}`}>•••• {c.card_last4}</Link></TableCell><TableCell>{c.customers?.company_name ?? c.customers?.contact_name ?? '—'}</TableCell><TableCell>{c.driver_name ?? '—'}</TableCell><TableCell>{c.external_driver_id ?? '—'}</TableCell><TableCell>{c.unit_number ?? '—'}</TableCell><TableCell><Badge variant="outline">{c.status}</Badge></TableCell><TableCell>{c.policy_number ?? '—'}</TableCell><TableCell>{c.is_overridden ? 'Yes' : 'No'}</TableCell><TableCell>{new Date(c.last_synced_at).toLocaleString()}</TableCell><TableCell><Badge variant={c.customer_id ? 'default' : 'destructive'}>{c.customer_id ? 'Matched' : 'Unmatched'}</Badge></TableCell></TableRow>)}</TableBody></Table></Card>}
    <TablePagination page={p.page} pageSize={p.pageSize} total={count ?? 0} itemLabel="cards" searchParams={{ q: p.q, status: p.status, match: p.match, sort: p.sort, dir: p.dir, pageSize: p.pageSize }} />
  </div>
}

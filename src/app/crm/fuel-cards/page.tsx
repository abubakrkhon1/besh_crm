import Link from 'next/link'
import { AlertTriangle, CheckCircle2, CreditCard, DollarSign, Ellipsis, Link2Off, Snowflake, Tag, UserRound, UserRoundX } from 'lucide-react'
import { getGeneralManagerDashboard } from '@/app/actions/leads'
import { DashboardDateFilter } from '@/components/crm/DashboardDateFilter'
import { FuelCardFilters, FuelCardSyncButton } from '@/components/crm/FuelCardControls'
import { FuelCardStatusChart } from '@/components/crm/FuelCardStatusChart'
import { PaginatedTable } from '@/components/crm/ui/PaginatedTable'
import { TablePagination } from '@/components/crm/ui/TablePagination'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LocalDateTime } from '@/components/ui/local-date-time'
import { fuelCardQuerySchema } from '@/lib/integrations/wex/schemas'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

type FuelCardRow = {
  id: string
  card_last4: string | null
  customer_id: string | null
  driver_name: string | null
  external_driver_id: string | null
  unit_number: string | null
  status: string
  policy_number: string | null
  is_overridden: boolean
  last_synced_at: string
  customers: { company_name: string | null; contact_name: string | null } | Array<{ company_name: string | null; contact_name: string | null }> | null
}

type SummaryCard = FuelCardRow & { customers: FuelCardRow['customers'] }

export default async function FuelCardsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = fuelCardQuerySchema.parse(await searchParams)
  const range = getFuelCardDateRange(params.from, params.to)
  const db = await createClient()
  const staleDate = new Date()
  staleDate.setUTCDate(staleDate.getUTCDate() - 1)
  const staleCutoff = staleDate.toISOString()

  let cardQuery: any = db
    .from('fuel_cards')
    .select('id,card_last4,customer_id,driver_name,external_driver_id,unit_number,status,policy_number,is_overridden,last_synced_at,customers(company_name,contact_name)', { count: 'exact' })
    .eq('provider', 'wex_efs')

  if (params.status) cardQuery = cardQuery.eq('status', params.status)
  if (params.match === 'matched') cardQuery = cardQuery.not('customer_id', 'is', null)
  if (params.match === 'unmatched') cardQuery = cardQuery.is('customer_id', null)
  if (params.policy) cardQuery = cardQuery.eq('policy_number', params.policy)
  if (params.customer) cardQuery = cardQuery.eq('customer_id', params.customer)
  if (params.sync === 'current') cardQuery = cardQuery.gte('last_synced_at', staleCutoff)
  if (params.sync === 'stale') cardQuery = cardQuery.lt('last_synced_at', staleCutoff)
  if (params.q) {
    const query = params.q.replace(/[%(),]/g, '')
    cardQuery = cardQuery.or(`card_last4.ilike.%${query}%,driver_name.ilike.%${query}%,external_driver_id.ilike.%${query}%,unit_number.ilike.%${query}%,status.ilike.%${query}%`)
  }

  const offset = (params.page - 1) * params.pageSize
  cardQuery = cardQuery.order(params.sort, { ascending: params.dir === 'asc' })
  if (params.sort === 'status') cardQuery = cardQuery.order('last_synced_at', { ascending: false })

  const [cardsResult, summaryResult, syncResult, failedRunsResult, transactionStats, activityResult, alertsResult] = await Promise.all([
    cardQuery.range(offset, offset + params.pageSize - 1),
    db.from('fuel_cards').select('id,card_last4,customer_id,driver_name,external_driver_id,unit_number,status,policy_number,is_overridden,last_synced_at,customers(company_name,contact_name)', { count: 'exact' }).eq('provider', 'wex_efs').range(0, 9_999),
    db.from('fuel_card_sync_runs').select('completed_at,cards_received,cards_unmatched').eq('provider', 'wex_efs').eq('status', 'succeeded').order('completed_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('fuel_card_sync_runs').select('id,started_at,completed_at,error_message').eq('provider', 'wex_efs').eq('status', 'failed').order('started_at', { ascending: false }).limit(3),
    getGeneralManagerDashboard(range.rangeStart, range.rangeEnd),
    db.from('fuel_transactions').select('id,transaction_date,amount,merchant_name,merchant_state,provider_transaction_type,customers(id,company_name,contact_name),fuel_cards(id,card_last4,driver_name)').eq('provider', 'wex_efs').eq('status', 'posted').gte('transaction_date', range.rangeStart).lt('transaction_date', range.rangeEnd).order('transaction_date', { ascending: false }).limit(25),
    db.from('wex_sync_alerts').select('id,severity,title,message,updated_at').eq('provider', 'wex_efs').eq('status', 'open').order('updated_at', { ascending: false }).limit(3),
  ])

  const cards = (cardsResult.data ?? []) as FuelCardRow[]
  const summaryCards = (summaryResult.data ?? []) as SummaryCard[]
  const statuses = [...new Set(summaryCards.map((card) => card.status).filter(Boolean))].sort()
  const policies = [...new Set(summaryCards.map((card) => card.policy_number).filter((value): value is string => Boolean(value)))].sort()
  const customers = buildCustomers(summaryCards)
  const statusDistribution = buildStatusDistribution(summaryCards)
  const assignedDrivers = new Set(summaryCards
    .filter((card) => card.external_driver_id || card.driver_name)
    .map((card) => card.external_driver_id ?? card.driver_name?.trim().toLowerCase()))
    .size
  const unmatchedCards = summaryCards.filter((card) => !card.customer_id)
  const missingDrivers = summaryCards.filter((card) => !card.external_driver_id && !card.driver_name)
  const overriddenCards = summaryCards.filter((card) => card.is_overridden)
  const sync = syncResult.data
  const syncHealthy = Boolean(sync?.completed_at && Date.parse(sync.completed_at) >= Date.parse(staleCutoff))
  const activity = (activityResult.data ?? []) as Array<Record<string, unknown>>
  const syncAlerts = (alertsResult.data ?? []) as Array<{ id: string, severity: 'warning' | 'critical', title: string, message: string, updated_at: string }>

  return (
    <div className="flex animate-fade-in flex-col gap-4 pb-12">
      <header className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Fuel Cards</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage and monitor WEX/EFS fuel card inventory, sync health, and card activity.</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <DashboardDateFilter from={range.from} to={range.to} path="/crm/fuel-cards" description="Choose the fuel transaction dates to include." />
          <Button type="button" variant="outline" size="lg" disabled title="Card issuance is not connected to a provider workflow yet.">
            <CreditCard data-icon="inline-start" />
            Issue card
          </Button>
          <FuelCardSyncButton />
        </div>
      </header>

      {syncAlerts[0] && (
        <Alert variant={syncAlerts[0].severity === 'critical' ? 'destructive' : 'default'}>
          <AlertTriangle />
          <AlertTitle>{syncAlerts[0].title}</AlertTitle>
          <AlertDescription>
            {syncAlerts[0].message}{syncAlerts.length > 1 ? ` ${syncAlerts.length - 1} additional sync alert${syncAlerts.length === 2 ? '' : 's'} are open.` : ''}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <main className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <FuelCardMetric title="Active cards" value={statusCount(statusDistribution, 'active')} detail="Current inventory" icon={<CreditCard />} tone="green" />
            <FuelCardMetric title="Frozen cards" value={statusCount(statusDistribution, 'frozen')} detail="Current inventory" icon={<Snowflake />} tone="violet" />
            <FuelCardMetric title="Assigned drivers" value={assignedDrivers} detail="Unique card assignments" icon={<UserRound />} tone="blue" />
            <FuelCardMetric title="Unmatched cards" value={unmatchedCards.length} detail="Need a customer match" icon={<Link2Off />} tone="orange" />
            <FuelCardMetric title="Period spend" value={formatCurrency(transactionStats?.spending)} detail="Selected date range" icon={<DollarSign />} tone="green" />
            <FuelCardMetric title="Period savings" value={formatCurrency(transactionStats?.savings)} detail="Selected date range" icon={<Tag />} tone="violet" />
          </div>

          <Card size="sm">
            <CardContent className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
                <span className="font-semibold">Last successful sync:</span>
                <span className="truncate text-muted-foreground">{sync?.completed_at ? <LocalDateTime value={sync.completed_at} /> : 'No successful sync yet'}</span>
                {sync && <span className="hidden text-muted-foreground md:inline">· {sync.cards_received.toLocaleString()} received · {sync.cards_unmatched.toLocaleString()} unmatched</span>}
              </div>
              <Badge variant="outline" className={syncHealthy ? 'border-status-success-foreground/15 bg-status-success text-status-success-foreground' : 'border-status-follow-up-foreground/15 bg-status-follow-up text-status-follow-up-foreground'}>
                {syncHealthy ? 'Healthy' : 'Needs attention'}
              </Badge>
            </CardContent>
          </Card>

          <Card className="overflow-hidden py-0">
            <CardHeader className="sr-only"><CardTitle>Fuel card inventory</CardTitle></CardHeader>
            <CardContent className="px-0 pb-0">
              <div className="p-4">
                <FuelCardFilters statuses={statuses} policies={policies} customers={customers.map(({ id, name }) => ({ id, name }))} />
              </div>
              {cardsResult.error ? (
                <p className="border-t p-8 text-center text-destructive">Fuel cards could not be loaded.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Card</TableHead><TableHead>Customer</TableHead><TableHead>Driver</TableHead><TableHead>Driver ID</TableHead><TableHead>Unit</TableHead><TableHead>Status</TableHead><TableHead>Policy</TableHead><TableHead>Override</TableHead><TableHead>Last synced</TableHead><TableHead>Match state</TableHead><TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cards.length ? cards.map((card) => (
                      <TableRow key={card.id} className="relative cursor-pointer">
                        <TableCell><Link className="font-mono font-semibold after:absolute after:inset-0 after:content-[''] hover:underline" href={`/crm/fuel-cards/${card.id}`}>•••• {card.card_last4 ?? '—'}<span className="sr-only"> — view fuel card</span></Link></TableCell>
                        <TableCell className="max-w-40 truncate">{card.customer_id ? <Link href={`/crm/customers/${card.customer_id}`} className="relative z-10 font-medium hover:underline">{customerName(card.customers)}</Link> : '—'}</TableCell>
                        <TableCell className="max-w-36 truncate">{card.driver_name ?? '—'}</TableCell>
                        <TableCell className="font-mono text-muted-foreground">{card.external_driver_id ?? '—'}</TableCell>
                        <TableCell>{card.unit_number ?? '—'}</TableCell>
                        <TableCell><CardStatusBadge status={card.status} /></TableCell>
                        <TableCell>{card.policy_number ?? '—'}</TableCell>
                        <TableCell>{card.is_overridden ? <Badge variant="outline" className="border-status-follow-up-foreground/15 bg-status-follow-up text-status-follow-up-foreground">Manual override</Badge> : 'No'}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground"><LocalDateTime value={card.last_synced_at} /></TableCell>
                        <TableCell><Badge variant="outline" className={card.customer_id ? 'border-status-success-foreground/15 bg-status-success text-status-success-foreground' : 'border-destructive/15 bg-destructive/10 text-destructive'}>{card.customer_id ? 'Matched' : 'Unmatched'}</Badge></TableCell>
                        <TableCell className="text-right"><Link href={`/crm/fuel-cards/${card.id}`} aria-label={`View card ending ${card.card_last4}`} className={cn(buttonVariants({ variant: 'outline', size: 'icon-sm' }), 'relative z-10')}><Ellipsis /></Link></TableCell>
                      </TableRow>
                    )) : <TableRow><TableCell colSpan={11} className="h-36 text-center text-muted-foreground">No fuel cards match the current filters.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
              <div className="px-4">
                <TablePagination page={params.page} pageSize={params.pageSize} total={cardsResult.count ?? 0} itemLabel="cards" searchParams={{ q: params.q, status: params.status, match: params.match, policy: params.policy, customer: params.customer, sync: params.sync, sort: params.sort, dir: params.dir, from: range.from, to: range.to, pageSize: params.pageSize }} />
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Recent fuel card activity</CardTitle>
              <CardDescription>Latest posted purchases in the selected date range.</CardDescription>
              <CardAction><Link href={`/crm/transactions?from=${range.from}&to=${range.to}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>View all activity</Link></CardAction>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <PaginatedTable
                embedded
                header={<TableHeader><TableRow><TableHead className="pl-5">Card</TableHead><TableHead>Customer</TableHead><TableHead>Driver</TableHead><TableHead>Transaction</TableHead><TableHead>Date / time</TableHead><TableHead>Amount</TableHead><TableHead className="pr-5">Location</TableHead></TableRow></TableHeader>}
                rows={activity.map((transaction) => {
                  const fuelCard = oneRelation(transaction.fuel_cards)
                  const customer = oneRelation(transaction.customers)
                  const fuelCardId = typeof fuelCard?.id === 'string' ? fuelCard.id : null
                  const customerId = typeof customer?.id === 'string' ? customer.id : null
                  return <TableRow key={String(transaction.id)} className={cn(fuelCardId && 'relative cursor-pointer')}>
                    <TableCell className="pl-5 font-mono font-semibold">{fuelCardId ? <Link href={`/crm/fuel-cards/${fuelCardId}`} className="after:absolute after:inset-0 after:content-[''] hover:underline">•••• {String(fuelCard?.card_last4 ?? '—')}<span className="sr-only"> — view fuel card</span></Link> : '—'}</TableCell>
                    <TableCell>{customerId ? <Link href={`/crm/customers/${customerId}`} className="relative z-10 font-medium hover:underline">{String(customer?.company_name ?? customer?.contact_name ?? 'Customer')}</Link> : '—'}</TableCell>
                    <TableCell>{String(fuelCard?.driver_name ?? '—')}</TableCell>
                    <TableCell>{formatLabel(String(transaction.provider_transaction_type ?? 'fuel_purchase'))}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground"><LocalDateTime value={String(transaction.transaction_date)} /></TableCell>
                    <TableCell className="font-semibold tabular-nums">{formatCurrency(Number(transaction.amount))}</TableCell>
                    <TableCell className="max-w-48 truncate pr-5">{[transaction.merchant_name, transaction.merchant_state].filter(Boolean).join(' · ') || 'Unknown'}</TableCell>
                  </TableRow>
                })}
                columnCount={7}
                itemLabel="activities"
                emptyMessage="No fuel card activity in this date range."
                initialPageSize={5}
                pageSizes={[5, 10, 25]}
              />
            </CardContent>
          </Card>
        </main>

        <aside className="flex min-w-0 flex-col gap-4">
          <FuelCardStatusChart statuses={statusDistribution} />

          <Card>
            <CardHeader>
              <CardTitle>Recent sync issues</CardTitle>
              <CardDescription>Live exceptions that may need review.</CardDescription>
              <CardAction><Badge variant="destructive">{unmatchedCards.length + missingDrivers.length + overriddenCards.length + (failedRunsResult.data?.length ?? 0)}</Badge></CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {unmatchedCards.slice(0, 1).map((card) => <SyncIssue key={`match-${card.id}`} icon={<Link2Off />} title="Unmatched card" description={`Card ending in ${card.card_last4 ?? '—'} could not be matched to a customer.`} date={card.last_synced_at} />)}
              {missingDrivers.slice(0, 1).map((card) => <SyncIssue key={`driver-${card.id}`} icon={<UserRoundX />} title="Driver not found" description={`No driver assignment is available for card ending in ${card.card_last4 ?? '—'}.`} date={card.last_synced_at} />)}
              {overriddenCards.slice(0, 1).map((card) => <SyncIssue key={`override-${card.id}`} icon={<AlertTriangle />} title="Manual override" description={`Card ending in ${card.card_last4 ?? '—'} is currently overridden.`} date={card.last_synced_at} />)}
              {(failedRunsResult.data ?? []).slice(0, Math.max(0, 3 - Number(Boolean(unmatchedCards.length)) - Number(Boolean(missingDrivers.length)) - Number(Boolean(overriddenCards.length)))).map((run) => <SyncIssue key={run.id} icon={<AlertTriangle />} title="Synchronization failed" description={run.error_message ?? 'WEX synchronization did not complete.'} date={run.completed_at ?? run.started_at} />)}
              {!unmatchedCards.length && !missingDrivers.length && !overriddenCards.length && !failedRunsResult.data?.length && <p className="py-6 text-center text-sm text-muted-foreground">No current sync issues.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top customers by card count</CardTitle>
              <CardDescription>Largest current WEX card inventories.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {customers.slice(0, 5).map((customer) => (
                <Link key={customer.id} href={`/crm/customers/${customer.id}`} className="flex items-center justify-between gap-3 text-sm hover:underline">
                  <span className="truncate font-medium">{customer.name}</span>
                  <span className="font-semibold tabular-nums">{customer.count.toLocaleString()}</span>
                </Link>
              ))}
              {!customers.length && <p className="py-6 text-center text-sm text-muted-foreground">No matched customers.</p>}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}

type MetricTone = 'green' | 'violet' | 'blue' | 'orange'

const metricToneStyles: Record<MetricTone, string> = {
  green: 'bg-status-success text-status-success-foreground',
  violet: 'bg-status-process text-status-process-foreground',
  blue: 'bg-status-new text-status-new-foreground',
  orange: 'bg-status-follow-up text-status-follow-up-foreground',
}

function FuelCardMetric({ title, value, detail, icon, tone }: { title: string; value: string | number; detail: string; icon: React.ReactNode; tone: MetricTone }) {
  return <Card size="sm" className="min-w-0 shadow-sm transition-shadow hover:shadow-md">
    <CardHeader className="grid-cols-[minmax(0,1fr)_auto] px-4"><CardTitle className="truncate text-[13px]">{title}</CardTitle><CardAction className={cn('flex size-9 items-center justify-center rounded-lg [&_svg]:size-5', metricToneStyles[tone])}>{icon}</CardAction></CardHeader>
    <CardContent className="px-4"><p className="truncate text-2xl font-bold tracking-tight tabular-nums">{value}</p><p className="mt-1.5 truncate text-xs text-muted-foreground">{detail}</p></CardContent>
  </Card>
}

function CardStatusBadge({ status }: { status: string }) {
  const normalized = normalizeStatus(status)
  return <Badge variant="outline" className={cn(
    normalized === 'active' && 'border-status-success-foreground/15 bg-status-success text-status-success-foreground',
    normalized === 'frozen' && 'border-status-process-foreground/15 bg-status-process text-status-process-foreground',
    normalized === 'pending' && 'border-status-follow-up-foreground/15 bg-status-follow-up text-status-follow-up-foreground',
    ['inactive', 'cancelled', 'expired'].includes(normalized) && 'bg-muted text-muted-foreground',
  )}>{formatLabel(status)}</Badge>
}

function SyncIssue({ icon, title, description, date }: { icon: React.ReactNode; title: string; description: string; date: string }) {
  return <div className="flex gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive [&_svg]:size-4">{icon}</div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="text-sm font-semibold">{title}</p><LocalDateTime className="shrink-0 text-[10px] text-muted-foreground" value={date} variant="compact" /></div><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p></div></div>
}

function buildStatusDistribution(cards: SummaryCard[]) {
  const counts = new Map<string, number>()
  cards.forEach((card) => counts.set(normalizeStatus(card.status), (counts.get(normalizeStatus(card.status)) ?? 0) + 1))
  return [...counts.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count)
}

function statusCount(rows: Array<{ status: string; count: number }>, status: string) {
  return rows.find((row) => row.status === status)?.count ?? 0
}

function buildCustomers(cards: SummaryCard[]) {
  const customers = new Map<string, { id: string; name: string; count: number }>()
  cards.forEach((card) => {
    if (!card.customer_id) return
    const current = customers.get(card.customer_id)
    customers.set(card.customer_id, { id: card.customer_id, name: customerName(card.customers), count: (current?.count ?? 0) + 1 })
  })
  return [...customers.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

function customerName(relation: FuelCardRow['customers']) {
  const customer = Array.isArray(relation) ? relation[0] : relation
  return customer?.company_name ?? customer?.contact_name ?? 'Unknown customer'
}

function oneRelation(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown> | undefined) ?? null
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function getFuelCardDateRange(fromParam: string, toParam: string) {
  const now = new Date()
  const defaults = { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0) }
  const requestedRangeIsValid = isDateValue(fromParam) && isDateValue(toParam) && fromParam <= toParam
  const from = requestedRangeIsValid ? fromParam : toDateValue(defaults.from)
  const to = requestedRangeIsValid ? toParam : toDateValue(defaults.to)
  const inclusiveEnd = new Date(`${to}T00:00:00.000Z`)
  inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() + 1)
  return { from, to, rangeStart: new Date(`${from}T00:00:00.000Z`).toISOString(), rangeEnd: inclusiveEnd.toISOString() }
}

function isDateValue(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
}

function toDateValue(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeStatus(value: string) { return value.trim().toLowerCase().replaceAll(' ', '_') }
function formatLabel(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }
function formatCurrency(value: number | string | null | undefined) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value ?? 0)) }

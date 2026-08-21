import Link from 'next/link'
import {
  ArrowRight,
  ClipboardList,
  DollarSign,
  Download,
  Droplets,
  MoreHorizontal,
  ReceiptText,
  Tag,
} from 'lucide-react'
import { DashboardDateFilter } from '@/components/crm/DashboardDateFilter'
import { FuelCardSyncButton } from '@/components/crm/FuelCardControls'
import { TransactionFilters } from '@/components/crm/TransactionFilters'
import { TransactionStatusChart } from '@/components/crm/TransactionStatusChart'
import { TablePagination } from '@/components/crm/ui/TablePagination'
import { getTablePageSize } from '@/components/crm/ui/table-page-sizes'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LocalDateTime } from '@/components/ui/local-date-time'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

type SearchParams = Record<string, string | string[] | undefined>
type Relation = Record<string, unknown> | Array<Record<string, unknown>> | null

type TransactionRow = {
  id: string
  provider_transaction_id: string | null
  customer_id: string | null
  driver_id: string | null
  fuel_card_id: string | null
  merchant_name: string | null
  merchant_address: string | null
  merchant_state: string | null
  gallons: number | null
  amount: number
  savings: number
  status: string
  transaction_date: string
  provider_transaction_type: string | null
  customers: Relation
  fuel_cards: Relation
  drivers: Relation
}

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const rawParams = await searchParams
  const params = Object.fromEntries(Object.entries(rawParams).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])) as Record<string, string | undefined>
  const q = (params.q ?? '').trim().slice(0, 100)
  const status = (params.status ?? '').trim().slice(0, 30)
  const fuelType = (params.fuelType ?? '').trim().slice(0, 50)
  const customerId = validUuid(params.customer) ? params.customer : undefined
  const cardId = validUuid(params.card) ? params.card : undefined
  const page = Math.max(1, Number(params.page) || 1)
  const pageSize = getTablePageSize(params.pageSize, 25)
  const offset = (page - 1) * pageSize
  const range = getDateRange(params.from, params.to)
  const db = await createClient()

  let matchedCustomerIds: string[] = []
  let matchedCardIds: string[] = []
  let matchedDriverIds: string[] = []
  if (q) {
    const safe = q.replace(/[%(),]/g, '')
    const [customerMatches, cardMatches, driverMatches] = await Promise.all([
      db.from('customers').select('id').or(`company_name.ilike.%${safe}%,contact_name.ilike.%${safe}%`).limit(100),
      db.from('fuel_cards').select('id').or(`card_last4.ilike.%${safe}%,driver_name.ilike.%${safe}%`).limit(100),
      db.from('drivers').select('id').or(`first_name.ilike.%${safe}%,last_name.ilike.%${safe}%`).limit(100),
    ])
    matchedCustomerIds = (customerMatches.data ?? []).map((item) => item.id)
    matchedCardIds = (cardMatches.data ?? []).map((item) => item.id)
    matchedDriverIds = (driverMatches.data ?? []).map((item) => item.id)
  }

  const transactionSelect = 'id,provider_transaction_id,customer_id,driver_id,fuel_card_id,merchant_name,merchant_address,merchant_state,gallons,amount,savings,status,transaction_date,provider_transaction_type,customers(company_name,contact_name),fuel_cards(card_last4,driver_name),drivers(first_name,last_name)'
  let tableQuery: any = db
    .from('fuel_transactions')
    .select(transactionSelect, { count: 'exact' })
    .eq('provider', 'wex_efs')
    .gte('transaction_date', range.rangeStart)
    .lt('transaction_date', range.rangeEnd)

  if (status) tableQuery = tableQuery.eq('status', status)
  if (customerId) tableQuery = tableQuery.eq('customer_id', customerId)
  if (cardId) tableQuery = tableQuery.eq('fuel_card_id', cardId)
  if (fuelType) tableQuery = tableQuery.eq('provider_transaction_type', fuelType)
  if (q) {
    const safe = q.replace(/[%(),]/g, '')
    const relatedFilters = [
      matchedCustomerIds.length && `customer_id.in.(${matchedCustomerIds.join(',')})`,
      matchedCardIds.length && `fuel_card_id.in.(${matchedCardIds.join(',')})`,
      matchedDriverIds.length && `driver_id.in.(${matchedDriverIds.join(',')})`,
    ].filter(Boolean)
    tableQuery = tableQuery.or([
      `provider_transaction_id.ilike.%${safe}%`,
      `merchant_name.ilike.%${safe}%`,
      `merchant_state.ilike.%${safe}%`,
      `wex_carrier_id.ilike.%${safe}%`,
      ...relatedFilters,
    ].join(','))
  }

  const previousDuration = Date.parse(range.rangeEnd) - Date.parse(range.rangeStart)
  const previousStart = new Date(Date.parse(range.rangeStart) - previousDuration).toISOString()
  const [tableResult, periodResult, previousResult, customerResult, cardResult] = await Promise.all([
    tableQuery.order('transaction_date', { ascending: false }).range(offset, offset + pageSize - 1),
    db.from('fuel_transactions').select(transactionSelect).eq('provider', 'wex_efs').gte('transaction_date', range.rangeStart).lt('transaction_date', range.rangeEnd).order('transaction_date').range(0, 9_999),
    db.from('fuel_transactions').select('amount,savings,gallons,status').eq('provider', 'wex_efs').gte('transaction_date', previousStart).lt('transaction_date', range.rangeStart).range(0, 9_999),
    db.from('customers').select('id,company_name,contact_name').order('company_name').range(0, 9_999),
    db.from('fuel_cards').select('id,card_last4,driver_name').eq('provider', 'wex_efs').order('card_last4').range(0, 9_999),
  ])

  const transactions = (tableResult.data ?? []) as TransactionRow[]
  const periodTransactions = (periodResult.data ?? []) as TransactionRow[]
  const previousTransactions = previousResult.data ?? []
  const customers = (customerResult.data ?? []).map((customer) => ({ value: customer.id, label: customer.company_name ?? customer.contact_name ?? 'Unnamed customer' }))
  const cards = (cardResult.data ?? []).map((card) => ({ value: card.id, label: `•••• ${card.card_last4}${card.driver_name ? ` · ${card.driver_name}` : ''}` }))
  const statuses = [...new Set(periodTransactions.map((transaction) => transaction.status).filter(Boolean))].sort()
  const fuelTypes = [...new Set(periodTransactions.map((transaction) => transaction.provider_transaction_type).filter((value): value is string => Boolean(value)))].sort()
  const summary = buildSummary(periodTransactions, previousTransactions, cardResult.data?.length ?? 0)
  const exportParams = new URLSearchParams({ from: range.from, to: range.to })
  Object.entries({ q, status, customer: customerId, card: cardId, fuelType }).forEach(([key, value]) => { if (value) exportParams.set(key, value) })

  return (
    <div className="flex animate-fade-in flex-col gap-4 pb-12">
      <header className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
          <p className="mt-1 text-sm text-muted-foreground">Monitor WEX / EFS transaction activity, spending, savings, and sync status.</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <DashboardDateFilter from={range.from} to={range.to} path="/crm/transactions" description="Choose the fuel transaction dates to include." showPresets={false} />
          <Link href={`/api/transactions/export?${exportParams}`} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            <Download data-icon="inline-start" />
            Export
          </Link>
          <FuelCardSyncButton label="Sync transactions" />
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5" aria-label="Transaction metrics">
        <MetricCard title="Total transactions" value={summary.total.toLocaleString()} trend={summary.trends.total} detail="vs previous period" icon={<ClipboardList />} tone="blue" series={summary.daily.map((item) => item.count)} />
        <MetricCard title="Total spend" value={formatCurrency(summary.spending)} trend={summary.trends.spending} detail="vs previous period" icon={<DollarSign />} tone="green" series={summary.daily.map((item) => item.spending)} />
        <MetricCard title="Total savings" value={formatCurrency(summary.savings)} trend={summary.trends.savings} detail="vs previous period" icon={<Tag />} tone="violet" series={summary.daily.map((item) => item.savings)} />
        <MetricCard title="Average ticket" value={formatCurrency(summary.averageTicket)} trend={summary.trends.averageTicket} detail="vs previous period" icon={<ReceiptText />} tone="orange" series={summary.daily.map((item) => item.averageTicket)} />
        <MetricCard title="Gallons purchased" value={formatNumber(summary.gallons, 1)} trend={summary.trends.gallons} detail="vs previous period" icon={<Droplets />} tone="blue" series={summary.daily.map((item) => item.gallons)} />
      </section>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="flex min-w-0 flex-col gap-4">
          <Card id="transactions-table" className="min-w-0 overflow-hidden py-0">
          <CardHeader className="sr-only"><CardTitle>Transaction activity</CardTitle></CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-0 px-0">
            <div className="p-4">
              <TransactionFilters statuses={statuses} customers={customers} cards={cards} fuelTypes={fuelTypes} />
            </div>
            {tableResult.error ? (
              <p className="border-t p-8 text-center text-destructive">Transactions could not be loaded from Supabase.</p>
            ) : (
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="pl-4">Date / time</TableHead><TableHead>Customer</TableHead><TableHead>Card</TableHead><TableHead>Driver</TableHead><TableHead>Merchant</TableHead><TableHead>Location</TableHead><TableHead>Gallons</TableHead><TableHead>Amount</TableHead><TableHead>Savings</TableHead><TableHead>Status</TableHead><TableHead>WEX ID</TableHead><TableHead className="pr-4 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length ? transactions.map((transaction) => {
                    const customer = oneRelation(transaction.customers)
                    const fuelCard = oneRelation(transaction.fuel_cards)
                    const driver = oneRelation(transaction.drivers)
                    const driverName = fuelCard?.driver_name ?? (driver ? `${driver.first_name ?? ''} ${driver.last_name ?? ''}`.trim() : null)
                    return (
                      <TableRow key={transaction.id}>
                        <TableCell className="pl-4 text-xs text-muted-foreground"><LocalDateTime value={transaction.transaction_date} /></TableCell>
                        <TableCell>{transaction.customer_id ? <Link href={`/crm/customers/${transaction.customer_id}`} className="font-medium hover:underline">{String(customer?.company_name ?? customer?.contact_name ?? 'Customer')}</Link> : <Badge variant="destructive">Unmatched</Badge>}</TableCell>
                        <TableCell>{transaction.fuel_card_id ? <Link href={`/crm/fuel-cards/${transaction.fuel_card_id}`} className="font-mono font-medium hover:underline">•••• {String(fuelCard?.card_last4 ?? '—')}</Link> : '—'}</TableCell>
                        <TableCell>{String(driverName ?? '—')}</TableCell>
                        <TableCell className="max-w-40 truncate font-medium">{transaction.merchant_name ?? 'Unknown merchant'}</TableCell>
                        <TableCell className="max-w-44 truncate text-muted-foreground">{[transaction.merchant_address, transaction.merchant_state].filter(Boolean).join(', ') || '—'}</TableCell>
                        <TableCell className="tabular-nums">{transaction.gallons == null ? '—' : formatNumber(Number(transaction.gallons), 2)}</TableCell>
                        <TableCell className="font-semibold tabular-nums">{formatCurrency(transaction.amount)}</TableCell>
                        <TableCell className="tabular-nums">{formatCurrency(transaction.savings)}</TableCell>
                        <TableCell><TransactionStatusBadge status={transaction.status} /></TableCell>
                        <TableCell className="font-mono text-xs">{transaction.provider_transaction_id ?? '—'}</TableCell>
                        <TableCell className="pr-4 text-right"><Button type="button" variant="outline" size="icon-xs" disabled aria-label="Transaction actions"><MoreHorizontal /></Button></TableCell>
                      </TableRow>
                    )
                  }) : <TableRow><TableCell colSpan={12} className="h-36 text-center text-muted-foreground">No synchronized transactions match these filters.</TableCell></TableRow>}
                </TableBody>
              </Table>
            )}
          </CardContent>
          <CardFooter className="block border-t bg-card px-4 py-0">
            <TablePagination page={page} pageSize={pageSize} total={tableResult.count ?? 0} itemLabel="transactions" searchParams={{ q, status, customer: customerId, card: cardId, fuelType, from: range.from, to: range.to, pageSize }} />
          </CardFooter>
          </Card>

        </main>

        <aside className="flex min-w-0 flex-col gap-4">
          <Card size="sm">
            <CardHeader><CardTitle>Transaction status</CardTitle></CardHeader>
            <CardContent><TransactionStatusChart statuses={summary.statuses} /></CardContent>
          </Card>

          <Card size="sm">
            <CardHeader><CardTitle>Top merchants by spend</CardTitle><CardDescription>Selected period</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              {summary.topMerchants.map((merchant) => <SummaryRankRow key={merchant.name} label={merchant.name} value={formatCurrency(merchant.amount)} percent={summary.spending ? merchant.amount / summary.spending : 0} />)}
              {!summary.topMerchants.length && <p className="py-6 text-center text-sm text-muted-foreground">No merchant activity.</p>}
            </CardContent>
            <CardFooter className="justify-end border-0 bg-card py-0"><Link href="#transactions-table" className={buttonVariants({ variant: 'link', size: 'sm' })}>View all merchants <ArrowRight data-icon="inline-end" /></Link></CardFooter>
          </Card>

          <Card size="sm">
            <CardHeader><CardTitle>Top customers by spend</CardTitle><CardDescription>Selected period</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              {summary.topCustomers.map((customer) => (
                <div key={customer.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-xs">
                  <Link href={`/crm/customers/${customer.id}`} className="truncate font-medium hover:underline">{customer.name}</Link>
                  <span className="font-semibold tabular-nums">{formatCurrency(customer.amount)}</span>
                  <Progress value={summary.spending ? (customer.amount / summary.spending) * 100 : 0} className="col-span-2 gap-0" aria-label={`${customer.name} share of spend`} />
                </div>
              ))}
              {!summary.topCustomers.length && <p className="py-6 text-center text-sm text-muted-foreground">No matched customer activity.</p>}
            </CardContent>
          </Card>

          <Card id="recent-exceptions" size="sm">
            <CardHeader><CardTitle>Recent exceptions</CardTitle><CardAction><Badge variant="destructive">{summary.recentExceptions.length}</Badge></CardAction></CardHeader>
            <CardContent className="flex min-w-0 flex-col gap-3">
              {summary.recentExceptions.map((exception) => (
                <div key={exception.id} className="flex min-w-0 flex-col gap-1 border-b pb-3 last:border-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-2 text-xs">
                    <span className={cn('size-2 shrink-0 rounded-full', exception.tone === 'danger' ? 'bg-destructive' : 'bg-pending')} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate font-medium">{exception.type}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(exception.amount)}</span>
                  </div>
                  <p className="truncate pl-4 text-xs text-muted-foreground">{exception.detail}</p>
                  <LocalDateTime className="pl-4 text-[11px] text-muted-foreground" value={exception.date} />
                </div>
              ))}
              {!summary.recentExceptions.length && <p className="py-6 text-center text-sm text-muted-foreground">No recent exceptions.</p>}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader><CardTitle>Flags / exceptions</CardTitle><CardAction><Badge variant="destructive">{summary.flags.total}</Badge></CardAction></CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              <FlagRow label="Reversed transactions" value={summary.flags.reversed} />
              <FlagRow label="High ticket transactions" value={summary.flags.highTicket} />
              <FlagRow label="Unmatched transactions" value={summary.flags.unmatched} />
              <FlagRow label="Cards with no activity" value={summary.flags.cardsWithoutActivity} />
            </CardContent>
            <CardFooter className="justify-end border-0 bg-card py-0"><Link href="#recent-exceptions" className={buttonVariants({ variant: 'link', size: 'sm' })}>View all exceptions <ArrowRight data-icon="inline-end" /></Link></CardFooter>
          </Card>
        </aside>
      </div>

    </div>
  )
}

type MetricTone = 'blue' | 'green' | 'violet' | 'orange'

const metricToneStyles: Record<MetricTone, string> = {
  blue: 'bg-status-new text-status-new-foreground',
  green: 'bg-status-success text-status-success-foreground',
  violet: 'bg-status-process text-status-process-foreground',
  orange: 'bg-status-follow-up text-status-follow-up-foreground',
}

function MetricCard({ title, value, trend, detail, icon, tone, series }: { title: string; value: string; trend: number | null; detail: string; icon: React.ReactNode; tone: MetricTone; series: number[] }) {
  return (
    <Card size="sm" className="min-w-0">
      <CardHeader className="grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4">
        <div className={cn('flex size-9 items-center justify-center rounded-full [&_svg]:size-5', metricToneStyles[tone])}>{icon}</div>
        <CardTitle className="min-w-0 truncate text-xs">{title}</CardTitle>
        <span className="justify-self-end whitespace-nowrap text-[10px] text-muted-foreground">This period</span>
      </CardHeader>
      <CardContent className="grid grid-cols-[minmax(0,1fr)_6rem] items-end gap-3 px-4">
        <div className="min-w-0">
          <p className="truncate text-xl font-bold tracking-tight tabular-nums">{value}</p>
          <p className="mt-2 truncate text-[11px] text-muted-foreground"><span className={cn('font-semibold', trend != null && trend >= 0 ? 'text-status-success-foreground' : 'text-destructive')}>{formatTrend(trend)}</span> {detail}</p>
        </div>
        <Sparkline values={series} tone={tone} />
      </CardContent>
    </Card>
  )
}

function Sparkline({ values, tone }: { values: number[]; tone: MetricTone }) {
  const data = values.length > 1 ? values : [0, values[0] ?? 0]
  const min = Math.min(...data)
  const max = Math.max(...data)
  const spread = max - min || 1
  const points = data.map((value, index) => `${(index / (data.length - 1)) * 100},${22 - ((value - min) / spread) * 18}`).join(' ')
  const stroke = tone === 'green' ? 'var(--success)' : tone === 'violet' ? 'var(--chart-3)' : tone === 'orange' ? 'var(--chart-4)' : 'var(--chart-1)'
  return <svg viewBox="0 0 100 24" className="h-8 w-full" role="img" aria-label="Metric trend"><polyline fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} /></svg>
}

function TransactionStatusBadge({ status }: { status: string }) {
  const normalized = status.trim().toLowerCase()
  return <Badge variant="outline" className={cn(
    normalized === 'posted' && 'border-status-success-foreground/15 bg-status-success text-status-success-foreground',
    normalized === 'pending' && 'border-status-follow-up-foreground/15 bg-status-follow-up text-status-follow-up-foreground',
    ['declined', 'reversed'].includes(normalized) && 'border-destructive/15 bg-destructive/10 text-destructive',
  )}>{formatLabel(status)}</Badge>
}

function SummaryRankRow({ label, value, percent }: { label: string; value: string; percent: number }) {
  return <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-xs"><span className="truncate font-medium">{label}</span><span className="font-semibold tabular-nums">{value}</span><span className="w-10 text-right text-muted-foreground tabular-nums">{formatPercent(percent)}</span></div>
}

function FlagRow({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between gap-3 text-xs"><span>{label}</span><span className="font-semibold tabular-nums">{value.toLocaleString()}</span></div>
}

function buildSummary(transactions: TransactionRow[], previous: Array<{ amount: number; savings: number; gallons: number | null; status: string }>, cardCount: number) {
  const spending = transactions.reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0)
  const savings = transactions.reduce((sum, transaction) => sum + Number(transaction.savings ?? 0), 0)
  const gallons = transactions.reduce((sum, transaction) => sum + Number(transaction.gallons ?? 0), 0)
  const previousSpending = previous.reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0)
  const previousSavings = previous.reduce((sum, transaction) => sum + Number(transaction.savings ?? 0), 0)
  const previousGallons = previous.reduce((sum, transaction) => sum + Number(transaction.gallons ?? 0), 0)
  const averageTicket = transactions.length ? spending / transactions.length : 0
  const previousAverageTicket = previous.length ? previousSpending / previous.length : 0
  const statusMap = new Map<string, number>()
  const merchantMap = new Map<string, number>()
  const customerMap = new Map<string, { id: string; name: string; amount: number }>()
  const dailyMap = new Map<string, { count: number; spending: number; savings: number; gallons: number }>()
  const activeCardIds = new Set<string>()

  for (const transaction of transactions) {
    statusMap.set(transaction.status, (statusMap.get(transaction.status) ?? 0) + 1)
    const merchant = transaction.merchant_name?.trim() || 'Unknown merchant'
    merchantMap.set(merchant, (merchantMap.get(merchant) ?? 0) + Number(transaction.amount ?? 0))
    if (transaction.fuel_card_id) activeCardIds.add(transaction.fuel_card_id)
    if (transaction.customer_id) {
      const customer = oneRelation(transaction.customers)
      const item = customerMap.get(transaction.customer_id) ?? { id: transaction.customer_id, name: String(customer?.company_name ?? customer?.contact_name ?? 'Customer'), amount: 0 }
      item.amount += Number(transaction.amount ?? 0)
      customerMap.set(transaction.customer_id, item)
    }
    const day = transaction.transaction_date.slice(0, 10)
    const daily = dailyMap.get(day) ?? { count: 0, spending: 0, savings: 0, gallons: 0 }
    daily.count += 1
    daily.spending += Number(transaction.amount ?? 0)
    daily.savings += Number(transaction.savings ?? 0)
    daily.gallons += Number(transaction.gallons ?? 0)
    dailyMap.set(day, daily)
  }

  const highTicketThreshold = Math.max(500, averageTicket * 2)
  const reversed = transactions.filter((transaction) => transaction.status.toLowerCase() === 'reversed').length
  const highTicket = transactions.filter((transaction) => Number(transaction.amount) >= highTicketThreshold).length
  const unmatched = transactions.filter((transaction) => !transaction.customer_id).length
  const cardsWithoutActivity = Math.max(0, cardCount - activeCardIds.size)
  const flagged = [...transactions]
    .filter((transaction) => transaction.status.toLowerCase() === 'reversed' || !transaction.customer_id || Number(transaction.amount) >= highTicketThreshold)
    .sort((a, b) => Date.parse(b.transaction_date) - Date.parse(a.transaction_date))
    .slice(0, 3)
    .map((transaction) => {
      const fuelCard = oneRelation(transaction.fuel_cards)
      const isReversed = transaction.status.toLowerCase() === 'reversed'
      const isUnmatched = !transaction.customer_id
      return {
        id: transaction.id,
        type: isReversed ? 'Reversed transaction' : isUnmatched ? 'Unmatched transaction' : 'High ticket transaction',
        detail: transaction.merchant_name ?? `Card ending ${String(fuelCard?.card_last4 ?? '—')}`,
        date: transaction.transaction_date,
        amount: Number(transaction.amount),
        tone: isUnmatched ? 'warning' as const : 'danger' as const,
      }
    })

  return {
    total: transactions.length,
    spending,
    savings,
    gallons,
    averageTicket,
    trends: {
      total: percentChange(transactions.length, previous.length),
      spending: percentChange(spending, previousSpending),
      savings: percentChange(savings, previousSavings),
      gallons: percentChange(gallons, previousGallons),
      averageTicket: percentChange(averageTicket, previousAverageTicket),
    },
    daily: [...dailyMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, item]) => ({ date, ...item, averageTicket: item.count ? item.spending / item.count : 0 })),
    statuses: [...statusMap.entries()].map(([itemStatus, count]) => ({ status: itemStatus, count })).sort((a, b) => b.count - a.count),
    topMerchants: [...merchantMap.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5),
    topCustomers: [...customerMap.values()].sort((a, b) => b.amount - a.amount).slice(0, 5),
    flags: { reversed, highTicket, unmatched, cardsWithoutActivity, total: reversed + highTicket + unmatched + cardsWithoutActivity },
    recentExceptions: flagged,
  }
}

function oneRelation(value: Relation) {
  if (Array.isArray(value)) return value[0] ?? null
  return value && typeof value === 'object' ? value : null
}

function getDateRange(fromParam?: string, toParam?: string) {
  const now = new Date()
  const defaultFrom = formatDateInput(new Date(now.getFullYear(), now.getMonth(), 1))
  const defaultTo = formatDateInput(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  const from = validDateInput(fromParam) ? fromParam : defaultFrom
  const to = validDateInput(toParam) ? toParam : defaultTo
  const safeFrom = from <= to ? from : defaultFrom
  const safeTo = from <= to ? to : defaultTo
  return {
    from: safeFrom,
    to: safeTo,
    rangeStart: new Date(`${safeFrom}T00:00:00`).toISOString(),
    rangeEnd: new Date(new Date(`${safeTo}T00:00:00`).setDate(new Date(`${safeTo}T00:00:00`).getDate() + 1)).toISOString(),
  }
}

function validUuid(value?: string): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
}

function validDateInput(value?: string): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00`)))
}

function formatDateInput(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

function percentChange(current: number, previous: number) {
  if (!previous) return current ? null : 0
  return ((current - previous) / previous) * 100
}

function formatTrend(value: number | null) {
  if (value == null) return '—'
  const prefix = value >= 0 ? '↑ ' : '↓ '
  return `${prefix}${Math.abs(value).toFixed(1)}%`
}

function formatCurrency(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value ?? 0))
}

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value)
}

function formatPercent(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 }).format(value)
}

function formatLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

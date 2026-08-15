import Link from 'next/link'
import { ArrowRight, ChartNoAxesCombined, CircleGauge, Contact, CreditCard, DollarSign, Droplets, FileText, ListFilter, Plus, Receipt, UserCheck, Users } from 'lucide-react'
import { getGeneralManagerDashboard, getLeads, getSalesAgents, type LeadWithRepresentative } from '@/app/actions/leads'
import { LeadsTable } from '@/components/crm/LeadsTable'
import { NewLeadDialog } from '@/components/crm/NewLeadDialog'
import { DashboardDateFilter } from '@/components/crm/DashboardDateFilter'
import { SalesOverviewChart, SpendByStateChart } from '@/components/crm/OwnerDashboardCharts'
import { SalesManagerLeadDistribution, type SalesManagerLeadCounts } from '@/components/crm/SalesManagerLeadDistribution'
import { MetricCard } from '@/components/crm/ui/MetricCard'
import { PaginatedTable } from '@/components/crm/ui/PaginatedTable'
import { LeadStatusChart } from '@/components/crm/LeadStatusChart'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { getCurrentProfile } from '@/lib/supabase/server'
import type { Profile } from '@/types/database.types'

type DashboardSearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function DashboardPage({ searchParams }: { searchParams: DashboardSearchParams }) {
  const profile = await getCurrentProfile()
  const resolvedSearchParams = await searchParams

  if (profile?.role === 'sales_manager') return <SalesManagerDashboard name={profile.full_name} searchParams={resolvedSearchParams} />
  if (profile?.role === 'sales_agent') return <SalesAgentDashboard name={profile.full_name} />
  return <GeneralManagerDashboard name={profile?.full_name} searchParams={resolvedSearchParams} />
}

async function GeneralManagerDashboard({
  name,
  searchParams,
}: {
  name?: string | null
  searchParams: Awaited<DashboardSearchParams>
}) {
  const range = getDashboardDateRange(searchParams)
  const [stats, leads] = await Promise.all([
    getGeneralManagerDashboard(range.rangeStart, range.rangeEnd),
    getLeads(),
  ])

  return (
    <div className="flex animate-fade-in flex-col gap-4 pb-12">
      <div className="grid min-w-0 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_36rem]">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back{name ? `, ${name.split(' ')[0]}` : ''}!</h1>
          <p className="mt-1 text-sm text-muted-foreground">Here&apos;s what&apos;s happening with your fuel operations.</p>
        </div>
        <DashboardDateFilter from={range.from} to={range.to} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <OwnerMetricCard title="Active cards" value={stats?.active_cards ?? 0} detail="Currently active" icon={<CreditCard />} tone="blue" />
        <OwnerMetricCard title="Gallons sold" value={formatGallons(stats?.gallons_sold)} detail="Selected date range" icon={<Droplets />} tone="teal" />
        <OwnerMetricCard title="Active customers" value={stats?.active_customers ?? 0} detail="Currently active" icon={<Users />} tone="violet" />
        <OwnerMetricCard title="Total spend" value={formatCurrency(stats?.spending)} detail="Selected date range" icon={<Receipt />} tone="orange" />
        <OwnerMetricCard title="Total savings" value={formatCurrency(stats?.savings)} detail="Selected date range" icon={<DollarSign />} tone="green" />
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <SalesOverviewChart data={stats?.daily_series ?? []} />
        </div>
        <div className="xl:col-span-4">
          <SpendByStateChart data={stats?.spend_by_state ?? []} total={Number(stats?.spending ?? 0)} />
        </div>
        <div className="xl:col-span-3">
          <TopFuelLocationsCard locations={stats?.top_locations ?? []} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <RecentLeadsCard leads={leads} />
        <RecentTransactionsCard transactions={stats?.recent_transactions ?? []} />
      </div>
    </div>
  )
}

type MetricTone = 'blue' | 'teal' | 'violet' | 'orange' | 'green'

const metricToneStyles: Record<MetricTone, string> = {
  blue: 'bg-chart-1/10 text-chart-1',
  teal: 'bg-chart-2/10 text-chart-2',
  violet: 'bg-chart-3/10 text-chart-3',
  orange: 'bg-chart-4/10 text-chart-4',
  green: 'bg-success/10 text-success',
}

function OwnerMetricCard({ title, value, detail, icon, tone }: { title: string; value: string | number; detail: string; icon: React.ReactNode; tone: MetricTone }) {
  return (
    <Card size="sm" className="min-w-0 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="grid-cols-[minmax(0,1fr)_auto] px-4">
        <CardTitle className="truncate text-[13px]">{title}</CardTitle>
        <CardAction className={cn('flex size-9 items-center justify-center rounded-lg [&_svg]:size-5', metricToneStyles[tone])}>
          {icon}
        </CardAction>
      </CardHeader>
      <CardContent className="px-4">
        <p className="truncate text-2xl font-bold tracking-tight tabular-nums">{value}</p>
        <p className="mt-1.5 text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  )
}

function TopFuelLocationsCard({ locations }: { locations: Array<{ name: string; gallons: number; spending: number }> }) {
  const largest = locations[0]?.gallons ?? 0

  return (
    <Card className="h-full min-h-[330px] shadow-sm">
      <CardHeader>
        <CardTitle>Top fuel locations</CardTitle>
        <CardDescription>Locations ranked by gallons sold.</CardDescription>
        <CardAction>
          <Link href="/crm/transactions" className={buttonVariants({ variant: 'outline', size: 'sm' })}>View all</Link>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {locations.length ? locations.map((location, index) => (
          <div key={location.name} className="flex items-start gap-3">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">{index + 1}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="truncate text-xs font-semibold" title={location.name}>{formatMerchantName(location.name)}</p>
                <p className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">{formatGallons(location.gallons)} gal</p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${location.name}: ${formatGallons(location.gallons)} gallons`}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${largest ? Math.max(8, (location.gallons / largest) * 100) : 0}%`,
                    backgroundColor: `var(--chart-${(index % 4) + 1})`,
                  }}
                />
              </div>
            </div>
          </div>
        )) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">No fuel locations in this date range.</div>
        )}
      </CardContent>
    </Card>
  )
}

function RecentLeadsCard({ leads }: { leads: Awaited<ReturnType<typeof getLeads>> }) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Recent leads</CardTitle>
        <CardDescription>Latest sales opportunities across the team.</CardDescription>
        <CardAction><Link href="/crm/leads" className={buttonVariants({ variant: 'outline', size: 'sm' })}>View all</Link></CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <PaginatedTable
          embedded
          header={<TableHeader>
            <TableRow><TableHead className="pl-5">Company</TableHead><TableHead>Contact</TableHead><TableHead>Status</TableHead><TableHead className="pr-5 text-right">Received</TableHead></TableRow>
          </TableHeader>}
          rows={leads.map((lead) => (
            <TableRow key={lead.id}>
              <TableCell className="max-w-40 truncate pl-5 font-semibold">{lead.company_name ?? '—'}</TableCell>
              <TableCell className="max-w-36 truncate text-muted-foreground">{lead.contact_first_name} {lead.contact_last_name}</TableCell>
              <TableCell><Badge variant="outline" className={leadStatusBadgeStyles[lead.status] ?? 'bg-muted text-muted-foreground'}>{formatLeadStatus(lead.status)}</Badge></TableCell>
              <TableCell className="pr-5 text-right text-muted-foreground">{formatDate(lead.created_at)}</TableCell>
            </TableRow>
          ))}
          columnCount={4}
          itemLabel="recent leads"
          emptyMessage="No recent leads."
          initialPageSize={5}
          pageSizes={[5, 10, 25]}
        />
      </CardContent>
    </Card>
  )
}

type RecentDashboardTransaction = {
  id: string
  transaction_date: string
  merchant_name: string | null
  merchant_state: string | null
  gallons: number | null
  amount: number
  savings: number
  fuel_card: { card_last4: string | null } | null
}

function RecentTransactionsCard({ transactions }: { transactions: RecentDashboardTransaction[] }) {
  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>Recent transactions</CardTitle>
        <CardDescription>Latest posted purchases in the selected range.</CardDescription>
        <CardAction><Link href="/crm/transactions" className={buttonVariants({ variant: 'outline', size: 'sm' })}>View all</Link></CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <PaginatedTable
          embedded
          header={<TableHeader>
            <TableRow><TableHead className="pl-5">Date</TableHead><TableHead>Location</TableHead><TableHead>Card</TableHead><TableHead>Gallons</TableHead><TableHead className="pr-5 text-right">Amount</TableHead></TableRow>
          </TableHeader>}
          rows={transactions.map((transaction) => (
            <TableRow key={transaction.id}>
              <TableCell className="pl-5 text-muted-foreground">{formatDate(transaction.transaction_date)}</TableCell>
              <TableCell className="max-w-44 truncate font-semibold" title={transaction.merchant_name ?? undefined}>{formatMerchantName(transaction.merchant_name ?? 'Unknown')}</TableCell>
              <TableCell className="font-mono text-muted-foreground">{transaction.fuel_card?.card_last4 ? `•••• ${transaction.fuel_card.card_last4}` : '—'}</TableCell>
              <TableCell className="tabular-nums">{formatGallons(transaction.gallons)}</TableCell>
              <TableCell className="pr-5 text-right font-semibold tabular-nums">{formatCurrency(transaction.amount)}</TableCell>
            </TableRow>
          ))}
          columnCount={5}
          itemLabel="recent transactions"
          emptyMessage="No transactions in this date range."
          initialPageSize={5}
          pageSizes={[5, 10, 25]}
        />
      </CardContent>
    </Card>
  )
}

function getDashboardDateRange(searchParams: Awaited<DashboardSearchParams>) {
  const currentMonth = getCurrentMonthDateRange()
  const from = getDateParam(searchParams.from) ?? currentMonth.from
  const to = getDateParam(searchParams.to) ?? currentMonth.to

  if (!isDateInputValue(from) || !isDateInputValue(to) || from > to) {
    return toDashboardQueryRange(currentMonth.from, currentMonth.to)
  }

  return toDashboardQueryRange(from, to)
}

function getCurrentMonthDateRange(now = new Date()) {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()

  return {
    from: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
    to: new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10),
  }
}

function getDateParam(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined
}

function isDateInputValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false

  return new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
}

function toDashboardQueryRange(from: string, to: string) {
  const inclusiveEnd = new Date(`${to}T00:00:00.000Z`)
  inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() + 1)

  return {
    from,
    to,
    rangeStart: new Date(`${from}T00:00:00.000Z`).toISOString(),
    rangeEnd: inclusiveEnd.toISOString(),
  }
}

function formatCurrency(value: number | string | null | undefined) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(Number(value ?? 0))
}

function formatGallons(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 3 })
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatMerchantName(value: string) {
  if (value !== value.toUpperCase()) return value
  return value.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatLeadStatus(status: string) {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getInitials(value: string) {
  return value.split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

const leadStatusBadgeStyles: Record<string, string> = {
  new: 'border-status-new-foreground/15 bg-status-new text-status-new-foreground',
  on_the_process: 'border-status-process-foreground/15 bg-status-process text-status-process-foreground',
  follow_up: 'border-status-follow-up-foreground/15 bg-status-follow-up text-status-follow-up-foreground',
  successful: 'border-status-success-foreground/15 bg-status-success text-status-success-foreground',
  deal_lost: 'border-status-lost-foreground/15 bg-status-lost text-status-lost-foreground',
}

async function SalesManagerDashboard({
  name,
  searchParams,
}: {
  name?: string | null
  searchParams: Awaited<DashboardSearchParams>
}) {
  const range = getDashboardDateRange(searchParams)
  const [leads, representatives] = await Promise.all([
    getLeads(),
    getSalesAgents(),
  ])
  const periodLeads = leads.filter((lead) => isInPeriod(lead.created_at, range.rangeStart, range.rangeEnd))
  const performance = buildSalesPeriodPerformance(representatives, leads, range.rangeStart, range.rangeEnd)
  const counts: SalesManagerLeadCounts = {
    new: periodLeads.filter((lead) => lead.status === 'new').length,
    on_the_process: periodLeads.filter((lead) => lead.status === 'on_the_process').length,
    follow_up: periodLeads.filter((lead) => lead.status === 'follow_up').length,
    successful: periodLeads.filter((lead) => lead.status === 'successful').length,
    deal_lost: periodLeads.filter((lead) => lead.status === 'deal_lost').length,
  }
  const acceptedLeads = periodLeads.filter((lead) => ['on_the_process', 'follow_up', 'successful'].includes(lead.status)).length
  const inProgressLeads = counts.on_the_process + counts.follow_up
  const insertedLeads = counts.successful
  const conversionRate = periodLeads.length ? Math.round((insertedLeads / periodLeads.length) * 1000) / 10 : 0
  const estimatedGallons = periodLeads.reduce((total, lead) => total + Number(lead.estimated_monthly_gallons ?? 0), 0)
  const openLeads = leads.filter(isOpenLead)
  const dashboardNow = new Date()
  const attentionQueue = buildLeadAttentionQueue(openLeads, dashboardNow)

  return (
    <div className="flex animate-fade-in flex-col gap-4 pb-12">
      <div className="grid min-w-0 items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_36rem]">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome back{name ? `, ${name.split(' ')[0]}` : ', Sales Manager'}!</h1>
          <p className="mt-1 text-sm text-muted-foreground">Track your team&apos;s performance, pipeline, and sales progress.</p>
        </div>
        <div className="flex min-w-0 flex-col gap-1 2xl:items-end">
          <p className="text-xs font-medium text-muted-foreground">Performance period</p>
          <DashboardDateFilter from={range.from} to={range.to} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:col-span-7">
          <OwnerMetricCard title="Total leads" value={periodLeads.length} detail="Received in selected period" icon={<Contact />} tone="blue" />
          <OwnerMetricCard title="In progress" value={inProgressLeads} detail="In process or follow-up" icon={<ListFilter />} tone="violet" />
          <OwnerMetricCard title="Accepted leads" value={acceptedLeads} detail="Accepted or further progressed" icon={<UserCheck />} tone="green" />
          <OwnerMetricCard title="Conversion rate" value={`${conversionRate}%`} detail="Inserted ÷ total leads" icon={<CircleGauge />} tone="orange" />
          <OwnerMetricCard title="Active sales agents" value={representatives.length} detail="Currently active" icon={<Users />} tone="teal" />
          <OwnerMetricCard title="Est. gallons / fleet" value={formatCompactNumber(estimatedGallons)} detail="Selected-period potential" icon={<Droplets />} tone="green" />
        </div>
        <div className="xl:col-span-5">
          <SalesManagerLeadDistribution counts={counts} />
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <SalesManagerPerformanceCard performance={performance} />
          <SalesManagerAttentionQueue leads={attentionQueue} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <SalesManagerRecentLeadsCard leads={periodLeads} />
          <SalesManagerQuickActions />
        </div>
      </div>
    </div>
  )
}

type SalesPeriodPerformance = {
  representative: Profile
  total: number
  accepted: number
  inserted: number
  conversionRate: number
  lastActivity: string | null
}

function buildSalesPeriodPerformance(
  representatives: Profile[],
  leads: LeadWithRepresentative[],
  rangeStart: string,
  rangeEnd: string,
): SalesPeriodPerformance[] {
  return representatives.map((representative) => {
    const representativeLeads = leads.filter((lead) => lead.assigned_to_profile_id === representative.id && isInPeriod(lead.created_at, rangeStart, rangeEnd))
    const accepted = representativeLeads.filter((lead) => ['on_the_process', 'follow_up', 'successful'].includes(lead.status)).length
    const inserted = representativeLeads.filter((lead) => lead.status === 'successful').length
    const lastActivity = representativeLeads.map((lead) => lead.updated_at).sort().at(-1) ?? null

    return {
      representative,
      total: representativeLeads.length,
      accepted,
      inserted,
      conversionRate: representativeLeads.length ? Math.round((inserted / representativeLeads.length) * 1000) / 10 : 0,
      lastActivity,
    }
  }).sort((a, b) => b.inserted - a.inserted || b.total - a.total)
}

function isInPeriod(value: string | null, rangeStart: string, rangeEnd: string) {
  if (!value) return false
  const timestamp = Date.parse(value)
  return timestamp >= Date.parse(rangeStart) && timestamp < Date.parse(rangeEnd)
}

function isOpenLead(lead: LeadWithRepresentative) {
  return ['new', 'on_the_process', 'follow_up'].includes(lead.status)
}

function buildLeadAttentionQueue(leads: LeadWithRepresentative[], now: Date) {
  return [...leads].sort((a, b) => {
    const priorityDifference = getLeadAttentionPriority(a, now) - getLeadAttentionPriority(b, now)
    if (priorityDifference) return priorityDifference

    const aActivity = Date.parse(a.status === 'new' ? a.created_at : a.updated_at)
    const bActivity = Date.parse(b.status === 'new' ? b.created_at : b.updated_at)
    return aActivity - bActivity
  })
}

function getLeadAttentionPriority(lead: LeadWithRepresentative, now: Date) {
  if (isLeadOverdue(lead, now)) return 0
  if (lead.status === 'new') return 1
  if (lead.status === 'follow_up') return 2
  return 3
}

function isLeadOverdue(lead: LeadWithRepresentative, now = new Date()) {
  return lead.status === 'new' && getElapsedBusinessDays(lead.created_at, now) >= 3
}

function getElapsedBusinessDays(from: string, to: Date) {
  const cursor = new Date(from)
  if (!Number.isFinite(cursor.getTime()) || cursor >= to) return 0

  cursor.setUTCHours(0, 0, 0, 0)
  const end = new Date(to)
  end.setUTCHours(0, 0, 0, 0)
  let days = 0

  while (cursor < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1)
    const day = cursor.getUTCDay()
    if (day !== 0 && day !== 6) days += 1
  }

  return days
}

function SalesManagerPerformanceCard({ performance }: { performance: SalesPeriodPerformance[] }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Sales agent performance</CardTitle>
        <CardDescription>Lead activity during the selected performance period.</CardDescription>
        <CardAction><Link href="/crm/sales-agents" className={buttonVariants({ variant: 'outline', size: 'sm' })}>View full report</Link></CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <PaginatedTable
          embedded
          header={<TableHeader>
            <TableRow><TableHead className="pl-5">Sales agent</TableHead><TableHead className="text-right">Total leads</TableHead><TableHead className="text-right">Accepted</TableHead><TableHead className="text-right">Inserted</TableHead><TableHead className="text-right">Conversion</TableHead><TableHead className="pr-5 text-right">Last activity</TableHead></TableRow>
          </TableHeader>}
          rows={performance.map((row) => (
            <TableRow key={row.representative.id}>
              <TableCell className="pl-5">
                <Link href={`/crm/leads?rep=${row.representative.id}`} className="flex items-center gap-2.5 font-semibold hover:underline">
                  <Avatar className="size-7"><AvatarFallback className="bg-primary/10 text-[10px] font-bold text-primary">{getInitials(row.representative.full_name ?? row.representative.email ?? 'SR')}</AvatarFallback></Avatar>
                  <span className="max-w-36 truncate">{row.representative.full_name ?? row.representative.email ?? 'Unnamed sales agent'}</span>
                </Link>
              </TableCell>
              <TableCell className="text-right tabular-nums">{row.total}</TableCell>
              <TableCell className="text-right tabular-nums">{row.accepted}</TableCell>
              <TableCell className="text-right font-semibold tabular-nums text-status-success-foreground">{row.inserted}</TableCell>
              <TableCell className="text-right"><Badge variant="outline" className="border-status-success-foreground/15 bg-status-success text-status-success-foreground">{row.conversionRate}%</Badge></TableCell>
              <TableCell className="whitespace-nowrap pr-5 text-right text-xs text-muted-foreground">{row.lastActivity ? formatDate(row.lastActivity) : 'No activity'}</TableCell>
            </TableRow>
          ))}
          columnCount={6}
          itemLabel="sales agents"
          emptyMessage="No sales agents are available."
          initialPageSize={5}
          pageSizes={[5, 10, 25]}
        />
      </CardContent>
    </Card>
  )
}

function SalesManagerAttentionQueue({ leads }: { leads: LeadWithRepresentative[] }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Lead attention queue</CardTitle>
        <CardDescription>Current open leads, independent of the performance period.</CardDescription>
        <CardAction><Link href="/crm/leads" className={buttonVariants({ variant: 'outline', size: 'sm' })}>View all leads</Link></CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <PaginatedTable
          embedded
          header={<TableHeader>
            <TableRow><TableHead className="pl-5">Company</TableHead><TableHead>Contact</TableHead><TableHead>Attention</TableHead><TableHead>Sales agent</TableHead><TableHead className="pr-5 text-right">Last activity</TableHead></TableRow>
          </TableHeader>}
          rows={leads.map((lead) => (
            <TableRow key={lead.id}>
              <TableCell className="max-w-36 truncate pl-5 font-semibold">{lead.company_name ?? '—'}</TableCell>
              <TableCell className="max-w-32 truncate text-muted-foreground">{lead.contact_first_name} {lead.contact_last_name}</TableCell>
              <TableCell><LeadAttentionBadge lead={lead} /></TableCell>
              <TableCell className="max-w-28 truncate text-muted-foreground">{lead.representative?.full_name ?? 'Unassigned'}</TableCell>
              <TableCell className="pr-5 text-right text-muted-foreground">{formatDate(lead.updated_at)}</TableCell>
            </TableRow>
          ))}
          columnCount={5}
          itemLabel="attention leads"
          emptyMessage="No open leads need attention."
          initialPageSize={5}
          pageSizes={[5, 10, 25]}
        />
      </CardContent>
    </Card>
  )
}

function LeadAttentionBadge({ lead }: { lead: LeadWithRepresentative }) {
  if (isLeadOverdue(lead)) return <Badge variant="destructive">Overdue</Badge>
  if (lead.status === 'new') return <Badge variant="outline" className="border-status-follow-up-foreground/15 bg-status-follow-up text-status-follow-up-foreground">Untouched</Badge>
  return <Badge variant="outline" className={leadStatusBadgeStyles[lead.status]}>{formatLeadStatus(lead.status)}</Badge>
}

function SalesManagerRecentLeadsCard({ leads }: { leads: LeadWithRepresentative[] }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Recent leads</CardTitle>
        <CardDescription>Latest leads received during the selected performance period.</CardDescription>
        <CardAction><Link href="/crm/leads" className={buttonVariants({ variant: 'outline', size: 'sm' })}>View all leads</Link></CardAction>
      </CardHeader>
      <CardContent className="px-0">
        <PaginatedTable
          embedded
          header={<TableHeader>
            <TableRow><TableHead className="pl-5">Company</TableHead><TableHead>Contact</TableHead><TableHead>Fleet</TableHead><TableHead>Source</TableHead><TableHead>Status</TableHead><TableHead>Sales agent</TableHead><TableHead>Received</TableHead><TableHead className="pr-5">Account type</TableHead></TableRow>
          </TableHeader>}
          rows={leads.map((lead) => (
            <TableRow key={lead.id}>
              <TableCell className="max-w-36 truncate pl-5 font-semibold">{lead.company_name ?? '—'}</TableCell>
              <TableCell className="max-w-32 truncate text-muted-foreground">{lead.contact_first_name} {lead.contact_last_name}</TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">{lead.fleet_size ? `${lead.fleet_size} trucks` : '—'}</TableCell>
              <TableCell className="max-w-28 truncate text-muted-foreground">{formatLeadStatus(lead.source)}</TableCell>
              <TableCell><Badge variant="outline" className={leadStatusBadgeStyles[lead.status] ?? 'bg-muted text-muted-foreground'}>{formatLeadStatus(lead.status)}</Badge></TableCell>
              <TableCell className="max-w-28 truncate text-muted-foreground">{lead.representative?.full_name ?? lead.representative?.email ?? 'Unassigned'}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(lead.created_at)}</TableCell>
              <TableCell className="max-w-32 truncate pr-5 text-muted-foreground">{formatLeadStatus(lead.account_type)}</TableCell>
            </TableRow>
          ))}
          columnCount={8}
          itemLabel="recent leads"
          emptyMessage="No leads were received in this period."
          initialPageSize={5}
          pageSizes={[5, 10, 25]}
        />
      </CardContent>
    </Card>
  )
}

function SalesManagerQuickActions() {
  const actions = [
    { label: 'Add lead', href: '/crm/leads?new=1', icon: <Plus /> },
    { label: 'Lead pipeline', href: '/crm/leads', icon: <ListFilter /> },
    { label: 'Team activity', href: '/crm/sales-agents', icon: <ChartNoAxesCombined /> },
    { label: 'Applications', href: '/crm/applications', icon: <FileText /> },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick actions</CardTitle>
        <CardDescription>Jump directly into common management tasks.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((action) => (
          <Link key={action.href} href={action.href} className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-auto min-w-0 flex-col gap-2 py-4')}>
            {action.icon}
            <span className="truncate">{action.label}</span>
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}

async function SalesAgentDashboard({ name }: { name?: string | null }) {
  const leads = await getLeads()
  const inProcess = leads.filter((lead) => lead.status === 'on_the_process').length
  const successful = leads.filter((lead) => lead.status === 'successful').length
  const statusCounts = {
    new: leads.filter((lead) => lead.status === 'new').length,
    successful,
    deal_lost: leads.filter((lead) => lead.status === 'deal_lost').length,
    on_the_process: inProcess,
    follow_up: leads.filter((lead) => lead.status === 'follow_up').length,
  }
  const potentialGallons = leads.reduce(
    (total, lead) => total + (lead.estimated_monthly_gallons ?? 0),
    0,
  )

  return (
    <DashboardShell title={`My sales workspace${name ? ` · ${name}` : ''}`} description="Add prospects and track their progress into Fuel CRM.">
      <div className="grid items-stretch gap-4 md:grid-cols-2">
        <LeadStatusChart counts={statusCounts} />
        <div className="grid h-[300px] grid-cols-2 gap-4">
          <MetricCard className="min-w-0" title="My leads" value={leads.length} icon={<Contact />} />
          <MetricCard className="min-w-0" title="On the Process" value={inProcess} icon={<Contact />} />
          <MetricCard className="min-w-0" title="Successful" value={successful} icon={<Contact />} />
          <MetricCard
            className="min-w-0"
            title="Potential gallons / mo"
            value={potentialGallons.toLocaleString()}
            icon={<Droplets />}
          />
        </div>
      </div>
      <QuickActions leadLabel="Add lead" leadsLabel="View my leads" />
      <div>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Recent leads</h2>
          <NewLeadDialog label="Add lead" />
        </div>
        <LeadsTable leads={leads} showRepresentative={false} />
      </div>
    </DashboardShell>
  )
}

function QuickActions({ leadLabel, leadsLabel }: { leadLabel: string; leadsLabel: string }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="quick-actions-title">
      <div>
        <h2 id="quick-actions-title" className="text-lg font-semibold">Quick actions</h2>
        <p className="text-sm text-muted-foreground">Jump straight into your most common sales tasks.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-gradient-to-br from-card to-primary/5 transition-shadow hover:shadow-md">
          <CardHeader>
            <CardTitle>Create a new lead</CardTitle>
            <CardDescription>Add a prospect and start tracking the opportunity.</CardDescription>
            <CardAction className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Plus aria-hidden="true" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <NewLeadDialog label={leadLabel} size="default" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-card to-muted/45 transition-shadow hover:shadow-md">
          <CardHeader>
            <CardTitle>Open lead pipeline</CardTitle>
            <CardDescription>Review lead status, contacts, and recent activity.</CardDescription>
            <CardAction className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <ListFilter aria-hidden="true" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <Link href="/crm/leads" className={buttonVariants({ variant: 'outline' })}>
              {leadsLabel}
              <ArrowRight data-icon="inline-end" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

function DashboardShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex animate-fade-in flex-col gap-6 pb-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}

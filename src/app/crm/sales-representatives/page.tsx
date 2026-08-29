import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ArrowDown, ArrowUp, BadgeCheck, Bolt, CalendarDays, ChartNoAxesColumnIncreasing,
  CircleAlert, ContactRound, Download, FileText, ListChecks, Target, TrendingUp, Trophy, UserPlus, Users,
} from 'lucide-react'
import { getLeads, getSalesAgents } from '@/app/actions/leads'
import { getAvailableSalesAgents } from '@/app/actions/sales-agents'
import { SalesAgentTeamAssignment } from '@/components/crm/SalesAgentTeamAssignment'
import { SalesRepOwnershipChart, type OwnershipDatum } from '@/components/crm/SalesRepOwnershipChart'
import { buildRepresentativePerformance, initials, SalesRepresentativesTable, type RepresentativePerformance } from '@/components/crm/SalesRepresentativesTable'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { getCurrentProfile } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

type PageParams = { from?: string; to?: string }

export default async function SalesAgentsPage({ searchParams }: { searchParams: Promise<PageParams> }) {
  const profile = await getCurrentProfile()
  if (profile?.role !== 'sales_manager') redirect('/crm/dashboard')

  const params = await searchParams
  const period = resolvePeriod(params)
  const [representatives, availableAgents, leads, previousLeads] = await Promise.all([
    getSalesAgents(),
    getAvailableSalesAgents(),
    getLeads(undefined, period.start.toISOString(), period.end.toISOString()),
    getLeads(undefined, period.previousStart.toISOString(), period.start.toISOString()),
  ])
  const performance = buildRepresentativePerformance(representatives, leads)
  const previousPerformance = buildRepresentativePerformance(representatives, previousLeads)
  const accepted = leads.filter((lead) => !['new', 'deal_lost'].includes(lead.status)).length
  const inserted = leads.filter((lead) => lead.status === 'successful').length
  const previousAccepted = previousLeads.filter((lead) => !['new', 'deal_lost'].includes(lead.status)).length
  const previousInserted = previousLeads.filter((lead) => lead.status === 'successful').length
  const conversion = leads.length ? inserted / leads.length * 100 : 0
  const previousConversion = previousLeads.length ? previousInserted / previousLeads.length * 100 : 0
  const ownership = performance.filter((row) => row.total > 0).slice(0, 6).map((row, index): OwnershipDatum => ({
    id: row.representative.id,
    name: row.representative.full_name ?? row.representative.email ?? 'Unnamed sales agent',
    value: row.total,
    color: `var(--chart-${index % 5 + 1})`,
  }))
  const best = [...performance].sort((a, b) => b.conversionRate - a.conversionRate || b.successful - a.successful)[0]
  const needsAttention = [...performance].filter((row) => row.total > 0).sort((a, b) => a.conversionRate - b.conversionRate)[0]
  const mostImproved = findMostImproved(performance, previousPerformance)

  return (
    <div className="flex animate-fade-in flex-col gap-4 pb-8">
      <section className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <p className="text-[13px] text-muted-foreground">Monitor sales agent productivity, lead performance, and conversions.</p>
        <div className="flex flex-wrap items-center gap-2">
          <SalesAgentTeamAssignment agents={availableAgents} />
          <form className="flex flex-wrap items-center gap-2" action="/crm/sales-agents">
            <label className="flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-xs shadow-sm">
              <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
              <input type="date" name="from" defaultValue={period.from} className="bg-transparent outline-none" aria-label="Start date" />
              <span className="text-muted-foreground">—</span>
              <input type="date" name="to" defaultValue={period.to} className="bg-transparent outline-none" aria-label="End date" />
            </label>
            <button type="submit" className={buttonVariants({ variant: 'outline', size: 'sm' })}>Apply period</button>
            <button type="button" className={buttonVariants({ size: 'sm' })} title="Export is coming soon"><Download data-icon="inline-start" />Export</button>
          </form>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SalesMetricCard title="Active Sales Agents" value={representatives.length} previous={representatives.length} icon={Users} tone="blue" />
        <SalesMetricCard title="Total Leads" value={leads.length} previous={previousLeads.length} icon={ContactRound} tone="blue" />
        <SalesMetricCard title="Inserted to CRM" value={inserted} previous={previousInserted} icon={ListChecks} tone="purple" />
        <SalesMetricCard title="Accepted Leads" value={accepted} previous={previousAccepted} icon={BadgeCheck} tone="green" />
        <SalesMetricCard title="Team Conversion Rate" value={`${conversion.toFixed(1)}%`} numericValue={conversion} previous={previousConversion} icon={Target} tone="orange" percentagePoint />
      </section>

      <section className="grid min-w-0 gap-3 2xl:grid-cols-[minmax(0,1.55fr)_minmax(380px,1fr)]">
        <SalesRepresentativesTable performance={performance} />
        <SalesRepOwnershipChart data={ownership} />
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <PerformerCard title="Best Performer" icon={Trophy} tone="green" row={best} trend={trendFor(best, previousPerformance)} />
        <PerformerCard title="Needs Attention" icon={CircleAlert} tone="orange" row={needsAttention} trend={trendFor(needsAttention, previousPerformance)} />
        <PerformerCard title="Most Improved" icon={TrendingUp} tone="green" row={mostImproved} trend={trendFor(mostImproved, previousPerformance)} />
        <RecentActivity />
        <QuickActions />
      </section>
    </div>
  )
}

function SalesMetricCard({ title, value, numericValue, previous, icon: Icon, tone, percentagePoint = false }: {
  title: string; value: string | number; numericValue?: number; previous: number; icon: typeof Users; tone: 'blue' | 'green' | 'purple' | 'orange'; percentagePoint?: boolean
}) {
  const current = numericValue ?? Number(value)
  const change = percentagePoint ? current - previous : previous ? (current - previous) / previous * 100 : current ? 100 : 0
  const positive = change >= 0
  const toneClass = { blue: 'bg-primary/10 text-primary', green: 'bg-status-success text-status-success-foreground', purple: 'bg-status-process text-status-process-foreground', orange: 'bg-status-follow-up text-status-follow-up-foreground' }[tone]
  return <Card className="min-h-[126px] py-0">
    <CardContent className="flex h-full flex-col justify-between p-4">
      <div className="flex items-start justify-between gap-2">
        <span className={cn('flex size-9 items-center justify-center rounded-lg', toneClass)}><Icon className="size-5" /></span>
        <span className="rounded-md bg-muted px-2 py-1 text-[9px] font-medium text-muted-foreground">Selected Period</span>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <p className="mt-1 text-2xl font-bold tracking-tight tabular-nums">{typeof value === 'number' ? value.toLocaleString() : value}</p>
        <p className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
          {positive ? <ArrowUp className="size-3 text-status-success-foreground" /> : <ArrowDown className="size-3 text-destructive" />}
          <span className={positive ? 'font-semibold text-status-success-foreground' : 'font-semibold text-destructive'}>{Math.abs(change).toFixed(1)}{percentagePoint ? ' pp' : '%'}</span> vs last period
        </p>
      </div>
    </CardContent>
  </Card>
}

function PerformerCard({ title, icon: Icon, tone, row, trend }: { title: string; icon: typeof Trophy; tone: 'green' | 'orange'; row?: RepresentativePerformance; trend: number }) {
  const name = row?.representative.full_name ?? row?.representative.email ?? 'No sales agent'
  return <Card className="min-h-[252px] py-0">
    <CardHeader className="border-b px-4 py-3"><CardTitle className="flex items-center gap-2 text-sm"><span className={cn('flex size-7 items-center justify-center rounded-md', tone === 'green' ? 'bg-status-success text-status-success-foreground' : 'bg-status-follow-up text-status-follow-up-foreground')}><Icon className="size-4" /></span>{title}</CardTitle></CardHeader>
    <CardContent className="flex flex-1 flex-col gap-4 p-4">
      <div className="flex items-center gap-3"><Avatar className="size-11"><AvatarFallback className="bg-primary font-semibold text-primary-foreground">{initials(name)}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate font-semibold">{name}</p><p className="truncate text-xs text-muted-foreground">{row?.representative.department ?? 'Unassigned region'}</p></div></div>
      <div className="grid grid-cols-3 divide-x text-center"><Stat value={row?.successful ?? 0} label="Inserted Leads" /><Stat value={`${row?.conversionRate ?? 0}%`} label="Conversion Rate" /><Stat value={formatGallons(row?.estimatedGallons ?? 0)} label="Est. Gallons" /></div>
    </CardContent>
    <CardFooter className={cn('border-0 px-4 py-2 text-[10px]', trend >= 0 ? 'bg-status-success text-status-success-foreground' : 'bg-status-follow-up text-destructive')}>
      {trend >= 0 ? <ArrowUp className="mr-1 size-3" /> : <ArrowDown className="mr-1 size-3" />}<strong>{Math.abs(trend).toFixed(1)}%</strong><span className="ml-1 text-muted-foreground">vs last period</span>
    </CardFooter>
  </Card>
}

function Stat({ value, label }: { value: string | number; label: string }) { return <div className="px-1"><p className="font-bold tabular-nums">{value}</p><p className="mt-1 text-[9px] leading-tight text-muted-foreground">{label}</p></div> }

function RecentActivity() {
  return <Card className="min-h-[252px] py-0">
    <CardHeader className="border-b px-4 py-3"><CardTitle className="flex items-center gap-2 text-sm"><span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary"><ListChecks className="size-4" /></span>Recent Team Activity</CardTitle></CardHeader>
    <CardContent className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"><ListChecks className="size-5" /></span>
      <p className="text-xs font-medium">Activity timeline coming soon</p>
      <p className="text-[10px] text-muted-foreground">Lead performance above is already populated from Supabase.</p>
    </CardContent>
  </Card>
}

function QuickActions() { return <Card className="min-h-[252px] py-0"><CardHeader className="border-b px-4 py-3"><CardTitle className="flex items-center gap-2 text-sm"><Bolt className="size-4 text-primary" />Quick Actions</CardTitle></CardHeader><CardContent className="grid flex-1 grid-cols-2 gap-2 p-3"><QuickAction href="/crm/leads/new" icon={UserPlus} label="Add Lead" /><QuickAction href="/crm/leads" icon={ContactRound} label="Assign Leads" /><QuickAction href="/crm/sales-agents" icon={ChartNoAxesColumnIncreasing} label="Performance" /><QuickAction href="/crm/dashboard" icon={FileText} label="Create Report" /></CardContent></Card> }

function QuickAction({ href, icon: Icon, label }: { href: string; icon: typeof UserPlus; label: string }) { return <Link href={href} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-md border text-center text-[10px] font-medium transition-colors hover:bg-muted"><Icon className="size-6 text-primary" />{label}</Link> }

function resolvePeriod(params: PageParams) {
  const now = new Date(); const defaultEndDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); const defaultStart = new Date(defaultEndDate); defaultStart.setUTCDate(defaultStart.getUTCDate() - 29)
  const from = /^\d{4}-\d{2}-\d{2}$/.test(params.from ?? '') ? params.from! : defaultStart.toISOString().slice(0, 10)
  const to = /^\d{4}-\d{2}-\d{2}$/.test(params.to ?? '') ? params.to! : defaultEndDate.toISOString().slice(0, 10)
  const start = new Date(`${from}T00:00:00.000Z`); const end = new Date(`${to}T00:00:00.000Z`); end.setUTCDate(end.getUTCDate() + 1)
  const duration = end.getTime() - start.getTime(); const previousStart = new Date(start.getTime() - duration)
  return { from, to, start, end, previousStart }
}

function findMostImproved(current: RepresentativePerformance[], previous: RepresentativePerformance[]) { return [...current].sort((a, b) => trendFor(b, previous) - trendFor(a, previous))[0] }
function trendFor(row: RepresentativePerformance | undefined, previous: RepresentativePerformance[]) { if (!row) return 0; const old = previous.find((item) => item.representative.id === row.representative.id)?.successful ?? 0; return old ? (row.successful - old) / old * 100 : row.successful ? 100 : 0 }
const formatGallons = (value: number) => value >= 1_000 ? `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K` : value.toLocaleString()

import Link from 'next/link'
import { CreditCard, DollarSign, Ellipsis, Filter, Search, UserCheck, Users } from 'lucide-react'
import { CustomerHealthChart } from '@/components/crm/EntityOverviewCharts'
import { TablePagination } from '@/components/crm/ui/TablePagination'
import { getTablePageSize } from '@/components/crm/ui/table-page-sizes'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LocalDateTime } from '@/components/ui/local-date-time'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

type CustomerRow = {
  id: string; company_name: string | null; contact_name: string | null; email: string | null; phone: string | null; status: string; wex_carrier_id: string | null; wex_company_xref: string | null; last_synced_at: string | null; monthly_spend: number | null; fuel_cards: Array<{ count: number }>; fuel_transactions: Array<{ count: number }>
}

type CustomerSummaryRow = Pick<CustomerRow, 'id' | 'company_name' | 'contact_name' | 'status' | 'last_synced_at' | 'monthly_spend' | 'fuel_cards'>

// Avatar circle with initials
function CustomerAvatar({ name, status }: { name: string; status: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
  const colorMap: Record<string, string> = {
    active: 'bg-[#2563eb] text-white',
    pending: 'bg-[#f97316] text-white',
    inactive: 'bg-[#6b7280] text-white',
    suspended: 'bg-destructive text-white',
  }
  const colorClass = colorMap[status.toLowerCase()] ?? 'bg-[#8b5cf6] text-white'
  return (
    <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', colorClass)}>
      {initials || '??'}
    </span>
  )
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams
  const q = (params.q ?? '').trim().slice(0, 100)
  const status = (params.status ?? '').trim().slice(0, 30)
  const activity = ['current', 'stale', 'unsynced'].includes(params.activity ?? '') ? params.activity : ''
  const sort = ['last_synced_at', 'monthly_spend', 'company_name'].includes(params.sort ?? '') ? params.sort! : 'last_synced_at'
  const page = Math.max(1, Number(params.page) || 1)
  const pageSize = getTablePageSize(params.pageSize, 10)
  const offset = (page - 1) * pageSize
  const db = await createClient()
  const staleDate = new Date(); staleDate.setUTCDate(staleDate.getUTCDate() - 30); const staleCutoff = staleDate.toISOString()

  const { data: summaryData } = await db.from('customers').select('id,company_name,contact_name,status,last_synced_at,monthly_spend,fuel_cards(count)').range(0, 9_999)
  const summary = (summaryData ?? []) as CustomerSummaryRow[]
  const statuses = [...new Set(summary.map((c) => c.status).filter(Boolean))].sort()
  const statusCounts = buildStatusCounts(summary)
  const activeCustomers = statusCounts.find((item) => item.status === 'active')?.count ?? 0
  const totalCards = summary.reduce((sum, c) => sum + (c.fuel_cards?.[0]?.count ?? 0), 0)
  const monthlySpend = summary.reduce((sum, c) => sum + Number(c.monthly_spend ?? 0), 0)
  const topCustomers = [...summary].sort((a, b) => Number(b.monthly_spend ?? 0) - Number(a.monthly_spend ?? 0)).slice(0, 5)
  const latestSync = summary.map((c) => c.last_synced_at).filter((v): v is string => Boolean(v)).sort().at(-1)
  const synchronizedCustomers = summary.filter((customer) => Boolean(customer.last_synced_at)).length
  const unsynchronizedCustomers = summary.length - synchronizedCustomers

  let customerQuery: any = db.from('customers').select('id,company_name,contact_name,email,phone,status,wex_carrier_id,wex_company_xref,last_synced_at,monthly_spend,fuel_cards(count),fuel_transactions(count)', { count: 'exact' })
  if (q) {
    const safe = q.replace(/[%(),]/g, '')
    customerQuery = customerQuery.or(`company_name.ilike.%${safe}%,contact_name.ilike.%${safe}%,email.ilike.%${safe}%,wex_carrier_id.ilike.%${safe}%,wex_company_xref.ilike.%${safe}%`)
  }
  if (status) customerQuery = customerQuery.eq('status', status)
  if (activity === 'current') customerQuery = customerQuery.gte('last_synced_at', staleCutoff)
  if (activity === 'stale') customerQuery = customerQuery.lt('last_synced_at', staleCutoff)
  if (activity === 'unsynced') customerQuery = customerQuery.is('last_synced_at', null)
  customerQuery = customerQuery.order(sort, { ascending: sort === 'company_name', nullsFirst: false })
  const { data: customerData, count, error } = await customerQuery.range(offset, offset + pageSize - 1)
  const customers = (customerData ?? []) as CustomerRow[]

  return (
    <div className="flex animate-fade-in flex-col gap-4 pb-8">
      <header>
        <p className="text-[13px] text-muted-foreground">Monitor customer accounts synchronized from WEX carrier data.</p>
      </header>

      {/* Metrics derived from the current customer records. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CustomerMetricCard
          title="Total Customers"
          value={summary.length}
          description="Current customer records"
          icon={<Users className="size-5" />}
          iconClass="text-status-new-foreground"
        />
        <CustomerMetricCard
          title="Active Customers"
          value={activeCustomers}
          description={`${summary.length ? Math.round(activeCustomers / summary.length * 100) : 0}% of customers`}
          icon={<UserCheck className="size-5" />}
          iconClass="text-status-success-foreground"
        />
        <CustomerMetricCard
          title="Total Cards"
          value={totalCards.toLocaleString()}
          description="Cards linked to customers"
          icon={<CreditCard className="size-5" />}
          iconClass="text-status-process-foreground"
        />
        <CustomerMetricCard
          title="Monthly Spend"
          value={formatCompactCurrency(monthlySpend)}
          description="Combined current monthly spend"
          icon={<DollarSign className="size-5" />}
          iconClass="text-status-follow-up-foreground"
        />
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_17.75rem]">
        <main className="min-w-0">
          <Card className="overflow-hidden py-0">
            <CardHeader className="sr-only"><CardTitle>Customer filters and results</CardTitle></CardHeader>
            <CardContent className="px-0 pb-0">
              {/* Filter bar */}
              <form action="/crm/customers" className="flex flex-wrap items-center gap-3 p-4 pb-3">
                <input type="hidden" name="pageSize" value={pageSize} />
                <label className="relative min-w-[200px] flex-1">
                  <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
                  <Input name="q" defaultValue={q} className="h-9 pl-9 text-[12px]" placeholder="Search customers, carrier ID or company reference…" aria-label="Search customers" />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-24 rounded-md border bg-card px-2 pb-1 pt-1">
                    <span className="block text-[10px] leading-none text-muted-foreground">Status</span>
                    <NativeSelect className="w-full [&_[data-slot=native-select]]:h-5 [&_[data-slot=native-select]]:rounded-none [&_[data-slot=native-select]]:border-0 [&_[data-slot=native-select]]:bg-transparent [&_[data-slot=native-select]]:px-0 [&_[data-slot=native-select]]:py-0 [&_[data-slot=native-select]]:pr-6 [&_[data-slot=native-select]]:text-xs [&_[data-slot=native-select]]:shadow-none [&_[data-slot=native-select-icon]]:right-0" name="status" defaultValue={status} size="sm" aria-label="Filter customers by status">
                      <NativeSelectOption value="">All</NativeSelectOption>
                      {statuses.map((option) => <NativeSelectOption key={option} value={option}>{formatLabel(option)}</NativeSelectOption>)}
                    </NativeSelect>
                  </div>
                  <div className="w-44 rounded-md border bg-card px-2 pb-1 pt-1">
                    <span className="block text-[10px] leading-none text-muted-foreground">Activity</span>
                    <NativeSelect className="w-full [&_[data-slot=native-select]]:h-5 [&_[data-slot=native-select]]:rounded-none [&_[data-slot=native-select]]:border-0 [&_[data-slot=native-select]]:bg-transparent [&_[data-slot=native-select]]:px-0 [&_[data-slot=native-select]]:py-0 [&_[data-slot=native-select]]:pr-6 [&_[data-slot=native-select]]:text-xs [&_[data-slot=native-select]]:shadow-none [&_[data-slot=native-select-icon]]:right-0" name="activity" defaultValue={activity} size="sm" aria-label="Filter customers by activity">
                      <NativeSelectOption value="">All</NativeSelectOption>
                      <NativeSelectOption value="current">Recently synchronized</NativeSelectOption>
                      <NativeSelectOption value="stale">Needs refresh</NativeSelectOption>
                      <NativeSelectOption value="unsynced">Not synchronized</NativeSelectOption>
                    </NativeSelect>
                  </div>
                  <div className="w-44 rounded-md border bg-card px-2 pb-1 pt-1">
                    <span className="block text-[10px] leading-none text-muted-foreground">Sort by</span>
                    <NativeSelect className="w-full [&_[data-slot=native-select]]:h-5 [&_[data-slot=native-select]]:rounded-none [&_[data-slot=native-select]]:border-0 [&_[data-slot=native-select]]:bg-transparent [&_[data-slot=native-select]]:px-0 [&_[data-slot=native-select]]:py-0 [&_[data-slot=native-select]]:pr-6 [&_[data-slot=native-select]]:text-xs [&_[data-slot=native-select]]:shadow-none [&_[data-slot=native-select-icon]]:right-0" name="sort" defaultValue={sort} size="sm" aria-label="Sort customers">
                      <NativeSelectOption value="last_synced_at">Last Synchronized</NativeSelectOption>
                      <NativeSelectOption value="monthly_spend">Monthly Spend</NativeSelectOption>
                      <NativeSelectOption value="company_name">Customer Name</NativeSelectOption>
                    </NativeSelect>
                  </div>
                  <button type="submit" className="flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-muted transition-colors">
                    <Filter className="size-3.5" />Filters
                  </button>
                </div>
              </form>

              {error ? (
                <p className="border-t p-8 text-center text-destructive">Customers could not be loaded from Supabase.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>WEX Carrier</TableHead>
                      <TableHead>Company Reference</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Cards</TableHead>
                      <TableHead>Transactions</TableHead>
                      <TableHead>Monthly Spend</TableHead>
                      <TableHead>Last Synchronized</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.length ? customers.map((customer) => (
                      <TableRow key={customer.id} className="relative cursor-pointer">
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <CustomerAvatar name={customer.company_name ?? customer.contact_name ?? '?'} status={customer.status} />
                            <div className="min-w-0">
                              <Link href={`/crm/customers/${customer.id}`} className="font-semibold after:absolute after:inset-0 after:content-[''] hover:underline">
                                {customer.company_name ?? customer.contact_name ?? 'Unnamed customer'}
                                <span className="sr-only"> — view customer</span>
                              </Link>
                              <p className="text-xs text-muted-foreground">{customer.email ?? customer.phone ?? 'No contact details'}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{customer.wex_carrier_id ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{customer.wex_company_xref ?? '—'}</TableCell>
                        <TableCell><CustomerStatusBadge status={customer.status} /></TableCell>
                        <TableCell className="tabular-nums">{customer.fuel_cards?.[0]?.count ?? 0}</TableCell>
                        <TableCell className="tabular-nums">{customer.fuel_transactions?.[0]?.count ?? 0}</TableCell>
                        <TableCell className="font-medium tabular-nums">{formatCurrency(customer.monthly_spend)}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{customer.last_synced_at ? <LocalDateTime value={customer.last_synced_at} /> : 'Not synchronized'}</TableCell>
                        <TableCell className="text-right">
                          <Link href={`/crm/customers/${customer.id}`} aria-label={`View ${customer.company_name ?? 'customer'}`} className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'relative z-10')}>
                            <Ellipsis />
                          </Link>
                        </TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={9} className="h-36 text-center text-muted-foreground">No customers match the current filters.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
              <div className="px-4">
                <TablePagination page={page} pageSize={pageSize} total={count ?? 0} itemLabel="customers" searchParams={{ q, status, activity, sort, pageSize }} />
              </div>
            </CardContent>
          </Card>
        </main>

        {/* Sidebar */}
        <aside className="flex min-w-0 flex-col gap-4">
          {/* Customer Health */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Customer Health</CardTitle>
            </CardHeader>
            <CardContent>
              <CustomerHealthChart counts={statusCounts} />
            </CardContent>
          </Card>

          {/* Top Customers by Spend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Top Customers by Spend</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              {topCustomers.map((customer, index) => (
                <Link key={customer.id} href={`/crm/customers/${customer.id}`} className="flex items-center gap-2 text-sm hover:underline">
                  <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground shrink-0">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{customer.company_name ?? customer.contact_name ?? 'Unnamed'}</span>
                  <span className="font-semibold tabular-nums shrink-0">{formatCompactCurrency(customer.monthly_spend)}</span>
                </Link>
              ))}
            </CardContent>
          </Card>

          {/* Sync Summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Sync Summary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <SyncLine
                label="Last successful sync"
                value={latestSync ? <LocalDateTime value={latestSync} /> : 'No successful sync'}
                tone="green"
              />
              <SyncLine label="Customers synchronized" value={String(synchronizedCustomers)} tone="blue" />
              <SyncLine label="Not synchronized" value={String(unsynchronizedCustomers)} tone="orange" />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

type MetricTone = 'blue' | 'green' | 'violet' | 'orange'

function CustomerMetricCard({
  title, value, description, icon, iconClass,
}: {
  title: string; value: string | number; description: string;
  icon: React.ReactNode; iconClass: string;
}) {
  return (
    <Card size="sm" className="min-w-0 shadow-sm">
      <CardHeader className="grid grid-cols-[auto_1fr] items-center gap-x-3">
        <span className={cn(
          'row-span-2 flex size-11 shrink-0 items-center justify-center rounded-lg',
          title === 'Total Customers' && 'bg-status-new',
          title === 'Active Customers' && 'bg-status-success',
          title === 'Total Cards' && 'bg-status-process',
          title === 'Monthly Spend' && 'bg-status-follow-up',
          iconClass,
        )}>{icon}</span>
        <CardTitle className="truncate text-[11px] text-muted-foreground">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-[23px] font-bold leading-none tabular-nums">{typeof value === 'number' ? value.toLocaleString() : value}</p>
      </CardContent>
    </Card>
  )
}

function CustomerStatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase()
  return (
    <Badge variant="outline" className={cn(
      normalized === 'active' && 'border-status-success-foreground/15 bg-status-success text-status-success-foreground',
      ['inactive', 'suspended'].includes(normalized) && 'bg-muted text-muted-foreground',
      normalized === 'pending' && 'border-status-follow-up-foreground/15 bg-status-follow-up text-status-follow-up-foreground',
    )}>
      {formatLabel(status)}
    </Badge>
  )
}

function SyncLine({ label, value, tone }: { label: string; value: React.ReactNode; tone: MetricTone }) {
  const dotClass = {
    blue: 'bg-status-new-foreground',
    green: 'bg-status-success-foreground',
    orange: 'bg-status-follow-up-foreground',
    violet: 'bg-status-process-foreground',
  }[tone]
  return (
    <div className="flex items-start gap-3">
      <span className={cn('mt-1 size-2 rounded-full shrink-0', dotClass)} />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  )
}

function buildStatusCounts(customers: Array<Pick<CustomerRow, 'status'>>) {
  const counts = new Map<string, number>()
  customers.forEach((c) => { const s = c.status.toLowerCase(); counts.set(s, (counts.get(s) ?? 0) + 1) })
  return [...counts.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count)
}

function formatLabel(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase()) }
function formatCurrency(value: number | null | undefined) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value ?? 0)) }
function formatCompactCurrency(value: number | null | undefined) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(Number(value ?? 0)) }

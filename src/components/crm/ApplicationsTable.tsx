'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, CircleGauge, Clock3, Download, Ellipsis,
  FileCheck2, RefreshCw, Search, X
} from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import type { ApplicationSafe } from '@/lib/application-access'
import { createCsv } from '@/lib/csv'
import { ApplicationDrawer } from './drawers/ApplicationDrawer'
import { InviteApplicationDialog } from './InviteApplicationDialog'
import { ApplicationPipelineChart } from './EntityOverviewCharts'
import { DataTable } from './ui/DataTable'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'

type DateFilter = 'all' | 'this_month' | 'last_30_days'

export function ApplicationsTable({ initialApplications }: { initialApplications: ApplicationSafe[] }) {
  const router = useRouter()
  const [applications, setApplications] = useState<ApplicationSafe[]>(initialApplications)
  const [selectedApp, setSelectedApp] = useState<ApplicationSafe | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')

  useEffect(() => {
    // Server refreshes replace the live application snapshot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApplications(initialApplications)
  }, [initialApplications])

  const now = useMemo(() => new Date(), [])
  const monthStart = useMemo(() => new Date(now.getFullYear(), now.getMonth(), 1), [now])
  const last30Start = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29), [now])

  const counts = useMemo(() => ({
    pending: applications.filter((a) => a.status === 'pending').length,
    approved: applications.filter((a) => a.status === 'approved').length,
    denied: applications.filter((a) => a.status === 'denied').length,
    underReview: applications.filter((a) => a.status === 'under_review').length,
    needsDocuments: applications.filter((a) => a.status === 'needs_documents').length,
  }), [applications])

  const approvedThisMonth = applications.filter((a) => a.status === 'approved' && new Date(a.reviewed_at ?? a.updated_at) >= monthStart).length
  const decisions = counts.approved + counts.denied
  const approvalRate = decisions ? Math.round(counts.approved / decisions * 100) : 0

  const filteredApplications = useMemo(() => applications.filter((application) => {
    const normalizedSearch = search.trim().toLowerCase()
    const matchesSearch = !normalizedSearch || [application.company_legal_name, application.doing_business_as, application.first_name, application.last_name, application.email].some((value) => value?.toLowerCase().includes(normalizedSearch))
    const matchesStatus = statusFilter === 'all' || application.status === statusFilter
    const createdAt = new Date(application.created_at)
    const matchesDate = dateFilter === 'all' || (dateFilter === 'this_month' ? createdAt >= monthStart : createdAt >= last30Start)
    return matchesSearch && matchesStatus && matchesDate
  }), [applications, dateFilter, last30Start, monthStart, search, statusFilter])

  const columns: ColumnDef<ApplicationSafe>[] = [
    {
      accessorKey: 'company_legal_name', header: 'Company',
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
            {row.original.company_legal_name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold">{row.original.company_legal_name}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.doing_business_as ?? row.original.industry}</p>
          </div>
        </div>
      )
    },
    {
      id: 'contact', header: 'Contact',
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate">{row.original.first_name} {row.original.last_name}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
        </div>
      )
    },
    { accessorKey: 'total_trucks', header: 'Fleet Size', cell: ({ row }) => <span className="tabular-nums">{row.original.total_trucks.toLocaleString()}</span> },
    { accessorKey: 'created_at', header: 'Submitted', cell: ({ row }) => <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.original.submitted_at ?? row.original.created_at)}</span> },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <ApplicationStatusBadge status={row.original.status} /> },
    { id: 'actions', header: '', cell: ({ row }) => <Link href={`/crm/applications/${row.original.id}`} onClick={(e) => e.stopPropagation()} aria-label={`Open ${row.original.company_legal_name}`} className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}><Ellipsis /></Link> },
  ]

  const exportApplications = () => {
    const headers = ['Company', 'Contact', 'Email', 'Fleet Size', 'Submitted', 'Projected Spend', 'Status']
    const rows = filteredApplications.map((a) => [a.company_legal_name, `${a.first_name} ${a.last_name}`, a.email, a.total_trucks, a.submitted_at ?? a.created_at, a.projected_spend, a.status])
    const csv = createCsv([headers, ...rows])
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `applications-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const clearFilters = () => { setSearch(''); setStatusFilter('all'); setDateFilter('all') }
  const hasFilters = search || statusFilter !== 'all' || dateFilter !== 'all'

  return (
    <div className="flex animate-fade-in flex-col gap-4 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[23px] font-bold tracking-[-0.02em] text-foreground">Fuel Card Applications</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Review incoming fleet requests, documents, and underwriting decisions.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportApplications} disabled={!filteredApplications.length}>
            <Download data-icon="inline-start" />Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.refresh()}>
            <RefreshCw data-icon="inline-start" />Refresh
          </Button>
          <InviteApplicationDialog />
        </div>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_13.25rem]">
        <main className="flex min-w-0 flex-col gap-4">
          {/* Metric cards */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ApplicationMetricCard
              title="Pending Applications"
              value={counts.pending}
              description="Current review queue"
              icon={<Clock3 className="size-5" />}
              iconClass="text-status-follow-up-foreground"
            />
            <ApplicationMetricCard
              title="Approved This Month"
              value={approvedThisMonth}
              description="Based on review date"
              icon={<CheckCircle2 className="size-5" />}
              iconClass="text-status-success-foreground"
            />
            <ApplicationMetricCard
              title="Under Review"
              value={counts.underReview}
              description="Currently being reviewed"
              icon={<FileCheck2 className="size-5" />}
              iconClass="text-status-new-foreground"
            />
            <ApplicationMetricCard
              title="Approval Rate"
              value={`${approvalRate}%`}
              description={`${decisions.toLocaleString()} decided applications`}
              icon={<CircleGauge className="size-5" />}
              iconClass="text-status-process-foreground"
            />
          </div>

          {/* Table card */}
          <Card className="overflow-hidden py-0">
            <CardHeader className="sr-only"><CardTitle>Application filters and results</CardTitle></CardHeader>
            <CardContent className="px-0 pb-0">
              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-2 p-4 pb-3">
                <label className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-10 pl-9 text-[12px]"
                    placeholder="Search applications, companies, or contacts…"
                    aria-label="Search applications"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter}>
                    <NativeSelectOption value="all">All</NativeSelectOption>
                    <NativeSelectOption value="pending">Pending</NativeSelectOption>
                    <NativeSelectOption value="under_review">Under review</NativeSelectOption>
                    <NativeSelectOption value="needs_documents">Needs documents</NativeSelectOption>
                    <NativeSelectOption value="approved">Approved</NativeSelectOption>
                    <NativeSelectOption value="denied">Denied</NativeSelectOption>
                  </FilterSelect>
                  <FilterSelect label="Date" value={dateFilter} onChange={(v) => setDateFilter(v as DateFilter)}>
                    <NativeSelectOption value="all">All time</NativeSelectOption>
                    <NativeSelectOption value="this_month">This month</NativeSelectOption>
                    <NativeSelectOption value="last_30_days">Last 30 days</NativeSelectOption>
                  </FilterSelect>
                  {hasFilters && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      <X className="size-3" />Clear
                    </button>
                  )}
                </div>
              </div>
              <DataTable
                columns={columns}
                data={filteredApplications}
                onRowClick={setSelectedApp}
                emptyTitle="No applications found"
                emptyDescription="No applications match the current filters."
                embedded
              />
            </CardContent>
          </Card>
        </main>

        {/* Sidebar */}
        <aside className="flex min-w-0 flex-col gap-4">
          {/* Application Pipeline */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Application Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ApplicationPipelineChart counts={{ pending: counts.pending, approved: counts.approved, denied: counts.denied }} />
              <div className="mt-2 flex flex-col gap-2">
                {[
                  { label: 'Pending', count: counts.pending, pct: applications.length ? Math.round(counts.pending / applications.length * 100) : 0, color: 'bg-[#f97316]' },
                  { label: 'Under Review', count: counts.underReview, pct: applications.length ? Math.round(counts.underReview / applications.length * 100) : 0, color: 'bg-[#2563eb]' },
                  { label: 'Approved', count: counts.approved, pct: decisions ? Math.round(counts.approved / decisions * 100) : 0, color: 'bg-[#14b8a6]' },
                  { label: 'Needs Docs', count: counts.needsDocuments, pct: applications.length ? Math.round(counts.needsDocuments / applications.length * 100) : 0, color: 'bg-[#a855f7]' },
                  { label: 'Rejected', count: counts.denied, pct: decisions ? Math.round(counts.denied / decisions * 100) : 0, color: 'bg-destructive' },
                ].map(({ label, count, pct, color }) => (
                  <div key={label} className="flex items-center gap-2 text-xs">
                    <span className={cn('size-2 rounded-full shrink-0', color)} />
                    <span className="flex-1 text-muted-foreground">{label}</span>
                    <span className="font-semibold tabular-nums">{count} ({pct}%)</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {applications.slice(0, 5).map((app) => (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => setSelectedApp(app)}
                  className="flex items-start gap-2 text-left transition-opacity hover:opacity-80"
                >
                  <div className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white',
                    app.status === 'approved' ? 'bg-[#14b8a6]' : app.status === 'denied' ? 'bg-destructive' : 'bg-[#f97316]'
                  )}>
                    {app.company_legal_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{app.company_legal_name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {app.status === 'pending' ? 'Application submitted' : `Application ${app.status}`} · {relativeDate(app.reviewed_at ?? app.updated_at)}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted-foreground whitespace-nowrap">{relativeDate(app.updated_at)}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>

      <ApplicationDrawer application={selectedApp} isOpen={Boolean(selectedApp)} onClose={() => setSelectedApp(null)} />
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <div className="relative min-w-[108px] rounded-md border bg-card px-2 pb-1 pt-1">
      <span className="block text-[9px] leading-none text-muted-foreground">{label}</span>
      <NativeSelect className="h-5 border-0 bg-transparent px-0 py-0 text-[11px] shadow-none" value={value} onChange={(e) => onChange(e.target.value)} size="sm" aria-label={`Filter by ${label}`}>
        {children}
      </NativeSelect>
    </div>
  )
}

function ApplicationMetricCard({
  title, value, description, icon, iconClass,
}: {
  title: string; value: string | number; description: string;
  icon: React.ReactNode; iconClass: string;
}) {
  return (
    <Card size="sm" className="min-w-0 shadow-sm">
      <CardHeader className="grid grid-cols-[auto_1fr] items-center gap-x-3">
        <span className={cn(
          'row-span-2 flex size-10 shrink-0 items-center justify-center rounded-lg',
          title === 'Pending Applications' && 'bg-status-follow-up',
          title === 'Approved This Month' && 'bg-status-success',
          title === 'Under Review' && 'bg-status-new',
          title === 'Approval Rate' && 'bg-status-process',
          iconClass,
        )}>{icon}</span>
        <CardTitle className="truncate text-[11px] text-muted-foreground">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-[22px] font-bold leading-none tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

function ApplicationStatusBadge({ status }: { status: ApplicationSafe['status'] }) {
  return (
    <Badge variant="outline" className={cn(
      status === 'approved' && 'border-status-success-foreground/15 bg-status-success text-status-success-foreground',
      status === 'pending' && 'border-status-follow-up-foreground/15 bg-status-follow-up text-status-follow-up-foreground',
      status === 'under_review' && 'border-status-new-foreground/15 bg-status-new text-status-new-foreground',
      status === 'needs_documents' && 'border-status-process-foreground/15 bg-status-process text-status-process-foreground',
      status === 'denied' && 'border-destructive/15 bg-destructive/10 text-destructive',
    )}>
      {status.split('_').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ')}
    </Badge>
  )
}

function formatDateTime(value: string) { return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
function relativeDate(value: string) { const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000)); return days === 0 ? 'today' : `${days}d ago` }

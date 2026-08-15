'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CalendarDays, CheckCircle2, CircleGauge, Clock3, Download, Ellipsis,
  FileCheck2, FileText, Plus, RefreshCw, Search, X
} from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import type { Application } from '@/types/database.types'
import { ApplicationDrawer } from './drawers/ApplicationDrawer'
import { NewApplicationModal } from './NewApplicationModal'
import { ApplicationPipelineChart } from './EntityOverviewCharts'
import { DataTable } from './ui/DataTable'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'

type DateFilter = 'all' | 'this_month' | 'last_30_days'

// Deterministic sparkline data seeded from app index
function makeSparkline(base: number, variance: number, length = 10) {
  return Array.from({ length }, (_, i) => ({
    v: Math.max(0, base + Math.sin(i * 0.9) * variance + (i / length) * variance * 0.5),
  }))
}

function SparklineChart({ data, color }: { data: { v: number }[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <defs>
          <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#sg-${color.replace('#', '')})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function ApplicationsTable({ initialApplications }: { initialApplications: Application[] }) {
  const router = useRouter()
  const [applications, setApplications] = useState<Application[]>(initialApplications)
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)
  const [isNewModalOpen, setIsNewModalOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [assignedFilter, setAssignedFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')

  useEffect(() => {
    // Server refreshes replace the live application snapshot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApplications(initialApplications)
  }, [initialApplications])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel('applications-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, (payload) => {
      if (payload.eventType === 'INSERT') setApplications((current) => [payload.new as Application, ...current.filter((application) => application.id !== payload.new.id)])
      if (payload.eventType === 'UPDATE') {
        const updated = payload.new as Application
        setApplications((current) => current.some((application) => application.id === updated.id) ? current.map((application) => application.id === updated.id ? updated : application) : [updated, ...current])
        setSelectedApp((current) => current?.id === updated.id ? updated : current)
      }
      if (payload.eventType === 'DELETE') {
        const deleted = payload.old as Pick<Application, 'id'>
        setApplications((current) => current.filter((application) => application.id !== deleted.id))
        setSelectedApp((current) => current?.id === deleted.id ? null : current)
      }
    }).subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [])

  const now = useMemo(() => new Date(), [])
  const monthStart = useMemo(() => new Date(now.getFullYear(), now.getMonth(), 1), [now])
  const last30Start = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29), [now])

  const counts = useMemo(() => ({
    pending: applications.filter((a) => a.status === 'pending').length,
    approved: applications.filter((a) => a.status === 'approved').length,
    denied: applications.filter((a) => a.status === 'denied').length,
    underReview: applications.filter((a) => a.status === 'pending' && new Date(a.updated_at) >= last30Start).length,
  }), [applications, last30Start])

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

  // Pseudo-deterministic doc counts from application id
  function docCount(app: Application) {
    const seed = app.id.charCodeAt(0) + app.id.charCodeAt(1)
    const max = 5
    const got = Math.min(max, (seed % (max + 1)))
    return { got, max }
  }

  // Assigned rep initials derived from reviewed_by or company initials
  function assignedRep(app: Application) {
    if (app.reviewed_by) {
      const parts = app.reviewed_by.split(/\s+/)
      return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
    }
    const parts = (app.company_legal_name ?? '').split(/\s+/)
    return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('').slice(0, 2) || 'AS'
  }

  const repColors = ['bg-blue-500', 'bg-violet-500', 'bg-teal-500', 'bg-rose-500', 'bg-amber-500']
  function repColor(app: Application) {
    const seed = (app.reviewed_by ?? app.company_legal_name ?? '').charCodeAt(0) ?? 0
    return repColors[seed % repColors.length]
  }

  const columns: ColumnDef<Application>[] = [
    {
      accessorKey: 'company_legal_name', header: 'Company',
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-2">
          <div className={cn('flex size-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white', repColor(row.original))}>
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
    {
      id: 'documents', header: 'Documents',
      cell: ({ row }) => {
        const { got, max } = docCount(row.original)
        return (
          <div className="flex items-center gap-1.5">
            <FileText className={cn('size-4', got === max ? 'text-status-success-foreground' : got > 0 ? 'text-status-follow-up-foreground' : 'text-muted-foreground')} />
            <span className="text-xs tabular-nums text-muted-foreground">{got}/{max}</span>
          </div>
        )
      }
    },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <ApplicationStatusBadge status={row.original.status} /> },
    {
      id: 'assigned_rep', header: 'Assigned Rep',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white', repColor(row.original))}>
            {assignedRep(row.original)}
          </div>
          <span className="text-xs text-muted-foreground">{assignedRep(row.original)}.</span>
        </div>
      )
    },
    { id: 'actions', header: '', cell: ({ row }) => <Link href={`/crm/applications/${row.original.id}`} onClick={(e) => e.stopPropagation()} aria-label={`Open ${row.original.company_legal_name}`} className={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}><Ellipsis /></Link> },
  ]

  const exportApplications = () => {
    const headers = ['Company', 'Contact', 'Email', 'Fleet Size', 'Submitted', 'Projected Spend', 'Status']
    const rows = filteredApplications.map((a) => [a.company_legal_name, `${a.first_name} ${a.last_name}`, a.email, a.total_trucks, a.submitted_at ?? a.created_at, a.projected_spend, a.status])
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `applications-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const clearFilters = () => { setSearch(''); setStatusFilter('all'); setSourceFilter('all'); setAssignedFilter('all'); setDateFilter('all') }
  const hasFilters = search || statusFilter !== 'all' || sourceFilter !== 'all' || assignedFilter !== 'all' || dateFilter !== 'all'

  // Sparkline seed data
  const pendingSparkline = makeSparkline(counts.pending, 4)
  const approvedSparkline = makeSparkline(approvedThisMonth, 5)
  const reviewSparkline = makeSparkline(counts.underReview, 3)
  const rateSparkline = makeSparkline(approvalRate, 8)

  // Current month label
  const dateLabel = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return (
    <div className="flex animate-fade-in flex-col gap-4 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-[23px] font-bold tracking-[-0.02em] text-foreground">Fuel Card Applications</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">Review incoming fleet requests, documents, and underwriting decisions.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="font-normal text-muted-foreground">
            <CalendarDays data-icon="inline-start" />
            Jul 1 – {dateLabel}
          </Button>
          <Button variant="outline" size="sm" onClick={exportApplications} disabled={!filteredApplications.length}>
            <Download data-icon="inline-start" />Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.refresh()}>
            <RefreshCw data-icon="inline-start" />Refresh
          </Button>
          <Button size="sm" onClick={() => setIsNewModalOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus data-icon="inline-start" />New Application
          </Button>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_13.25rem]">
        <main className="flex min-w-0 flex-col gap-4">
          {/* Metric cards */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ApplicationMetricCard
              title="Pending Applications"
              value={counts.pending}
              trend="+12% vs Jun 1 – Jun 30"
              trendPositive
              icon={<Clock3 className="size-5" />}
              iconClass="text-status-follow-up-foreground"
              sparkline={pendingSparkline}
              sparkColor="#f97316"
            />
            <ApplicationMetricCard
              title="Approved This Month"
              value={approvedThisMonth}
              trend="+18% vs Jun 1 – Jun 30"
              trendPositive
              icon={<CheckCircle2 className="size-5" />}
              iconClass="text-status-success-foreground"
              sparkline={approvedSparkline}
              sparkColor="#14b8a6"
            />
            <ApplicationMetricCard
              title="Under Review"
              value={counts.underReview}
              trend="+6% vs Jun 1 – Jun 30"
              trendPositive
              icon={<FileCheck2 className="size-5" />}
              iconClass="text-status-new-foreground"
              sparkline={reviewSparkline}
              sparkColor="#2563eb"
            />
            <ApplicationMetricCard
              title="Approval Rate"
              value={`${approvalRate}%`}
              trend="+7% vs Jun 1 – Jun 30"
              trendPositive
              icon={<CircleGauge className="size-5" />}
              iconClass="text-status-process-foreground"
              sparkline={rateSparkline}
              sparkColor="#8b5cf6"
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
                    <NativeSelectOption value="approved">Approved</NativeSelectOption>
                    <NativeSelectOption value="denied">Denied</NativeSelectOption>
                  </FilterSelect>
                  <FilterSelect label="Source" value={sourceFilter} onChange={setSourceFilter}>
                    <NativeSelectOption value="all">All</NativeSelectOption>
                    <NativeSelectOption value="website">Website</NativeSelectOption>
                    <NativeSelectOption value="referral">Referral</NativeSelectOption>
                    <NativeSelectOption value="direct">Direct</NativeSelectOption>
                  </FilterSelect>
                  <FilterSelect label="Assigned Rep" value={assignedFilter} onChange={setAssignedFilter}>
                    <NativeSelectOption value="all">All</NativeSelectOption>
                    <NativeSelectOption value="as">Abubakr S.</NativeSelectOption>
                    <NativeSelectOption value="jd">John D.</NativeSelectOption>
                    <NativeSelectOption value="sr">Sara R.</NativeSelectOption>
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
                  { label: 'Needs Docs', count: 0, pct: 0, color: 'bg-[#a855f7]' },
                  { label: 'Rejected', count: counts.denied, pct: decisions ? Math.round(counts.denied / decisions * 100) : 0, color: 'bg-destructive' },
                ].map(({ label, count, pct, color }) => (
                  <div key={label} className="flex items-center gap-2 text-xs">
                    <span className={cn('size-2 rounded-full shrink-0', color)} />
                    <span className="flex-1 text-muted-foreground">{label}</span>
                    <span className="font-semibold tabular-nums">{count} ({pct}%)</span>
                  </div>
                ))}
              </div>
              <button className="mt-3 flex w-full items-center justify-between rounded-md px-0 py-1 text-xs font-medium text-primary hover:underline">
                View full pipeline <span>›</span>
              </button>
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
              <button className="mt-1 flex w-full items-center justify-between rounded-md px-0 py-1 text-xs font-medium text-primary hover:underline">
                View all activity <span>›</span>
              </button>
            </CardContent>
          </Card>
        </aside>
      </div>

      <ApplicationDrawer application={selectedApp} isOpen={Boolean(selectedApp)} onClose={() => setSelectedApp(null)} />
      {isNewModalOpen && <NewApplicationModal onClose={() => setIsNewModalOpen(false)} onSuccess={(app) => { setApplications((current) => [app, ...current]); setIsNewModalOpen(false) }} />}
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
  title, value, trend, trendPositive, icon, iconClass, sparkline, sparkColor,
}: {
  title: string; value: string | number; trend: string; trendPositive: boolean;
  icon: React.ReactNode; iconClass: string; sparkline: { v: number }[]; sparkColor: string;
}) {
  return (
    <Card className="min-w-0 overflow-hidden py-0 shadow-sm">
      <CardContent className="p-4 pb-3">
        <div className="flex items-start gap-3">
          <span className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg',
            title === 'Pending Applications' && 'bg-status-follow-up',
            title === 'Approved This Month' && 'bg-status-success',
            title === 'Under Review' && 'bg-status-new',
            title === 'Approval Rate' && 'bg-status-process',
            iconClass,
          )}>{icon}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold text-muted-foreground">{title}</p>
            <p className="mt-1 text-[22px] font-bold leading-none tabular-nums">{value}</p>
          </div>
        </div>
        <div className="mt-2 flex items-end justify-between gap-2">
          <p className={cn('flex items-center gap-1 text-[10px] font-medium', trendPositive ? 'text-status-success-foreground' : 'text-destructive')}>
            <span>{trendPositive ? '↗' : '↘'}</span><span>{trend}</span>
          </p>
          <div className="h-8 w-[74px] shrink-0"><SparklineChart data={sparkline} color={sparkColor} /></div>
        </div>
      </CardContent>
    </Card>
  )
}

function ApplicationStatusBadge({ status }: { status: Application['status'] }) {
  return (
    <Badge variant="outline" className={cn(
      status === 'approved' && 'border-status-success-foreground/15 bg-status-success text-status-success-foreground',
      status === 'pending' && 'border-status-follow-up-foreground/15 bg-status-follow-up text-status-follow-up-foreground',
      status === 'denied' && 'border-destructive/15 bg-destructive/10 text-destructive',
    )}>
      {status[0].toUpperCase() + status.slice(1)}
    </Badge>
  )
}

function formatDateTime(value: string) { return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
function relativeDate(value: string) { const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000)); return days === 0 ? 'today' : `${days}d ago` }

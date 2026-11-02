'use client'

import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LocalDateTime } from '@/components/ui/local-date-time'
import { NewLeadDialog } from '@/components/crm/NewLeadDialog'
import { PaginatedTable } from '@/components/crm/ui/PaginatedTable'
import type { LeadWithRepresentative } from '@/app/actions/leads'
import type { LeadAccountType, LeadPriority, LeadStatus, Profile } from '@/types/database.types'
import { cn } from '@/lib/utils'

const LeadDetailsSheet = dynamic(
  () => import('@/components/crm/LeadsTable').then((module) => module.LeadDetailsSheet),
  { ssr: false },
)

const statusLabels: Record<LeadStatus, string> = {
  new: 'New', successful: 'Successful', deal_lost: 'Deal Lost', on_the_process: 'On the Process', follow_up: 'Follow Up',
}
const statusBadgeStyles: Record<LeadStatus, string> = {
  new: 'border-status-new-foreground/15 bg-status-new text-status-new-foreground',
  on_the_process: 'border-status-process-foreground/15 bg-status-process text-status-process-foreground',
  follow_up: 'border-status-follow-up-foreground/15 bg-status-follow-up text-status-follow-up-foreground',
  successful: 'border-status-success-foreground/15 bg-status-success text-status-success-foreground',
  deal_lost: 'border-status-lost-foreground/15 bg-status-lost text-status-lost-foreground',
}
const accountTypeLabels: Record<LeadAccountType, string> = {
  prepaid_account: 'Prepaid Account', deposit: 'Deposit', credit_line: 'Credit Line',
}
const statusFilters: Array<{ value: 'all' | LeadStatus; label: string }> = [
  { value: 'all', label: 'All' }, { value: 'new', label: 'New' },
  { value: 'on_the_process', label: 'On the Process' }, { value: 'follow_up', label: 'Follow Up' },
  { value: 'successful', label: 'Successful' }, { value: 'deal_lost', label: 'Deal Lost' },
]

type Props = {
  leads: LeadWithRepresentative[]; showRepresentative: boolean; embedded?: boolean; paginationKey?: string
  representatives?: Profile[]; selectedRepresentativeId?: string; canAddLead?: boolean; canAssignLeads?: boolean
  canManageWorkPlan?: boolean; showFilters?: boolean; openNewLead?: boolean; totalLeads?: number
  page?: number; pageSize?: number; onPageChange?: (page: number) => void; onPageSizeChange?: (pageSize: number) => void
}

export function LeadsTable({
  leads, showRepresentative, embedded = false, paginationKey = '', representatives = [], selectedRepresentativeId,
  canAddLead = false, canAssignLeads = false, canManageWorkPlan = false, showFilters = false, openNewLead = false,
  totalLeads, page, pageSize, onPageChange, onPageSizeChange,
}: Props) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all')
  const [selectedLead, setSelectedLead] = useState<LeadWithRepresentative | null>(null)
  const filteredLeads = useMemo(() => statusFilter === 'all' ? leads : leads.filter((lead) => lead.status === statusFilter), [leads, statusFilter])
  const selectedRepresentative = representatives.find((representative) => representative.id === selectedRepresentativeId)
  const representativeLabel = selectedRepresentative?.full_name ?? selectedRepresentative?.email ?? 'All sales agents'

  return <div className="flex flex-col gap-4">
    {showFilters && <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2" aria-label="Filter leads by status">
        {statusFilters.map((filter) => <Button key={filter.value} type="button" variant="outline" size="sm" aria-pressed={statusFilter === filter.value} className={cn(statusFilter === filter.value && 'border-primary bg-primary-dim text-primary hover:bg-primary-dim')} onClick={() => setStatusFilter(filter.value)}>{filter.label}</Button>)}
      </div>
      <div className="flex items-center gap-2">
        {showRepresentative && representatives.length > 0 && <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" className="min-w-48 justify-between" />}><span className="truncate">{representativeLabel}</span><ChevronDown data-icon="inline-end" /></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64"><DropdownMenuGroup><DropdownMenuLabel>Sales agent</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => router.push('/crm/leads')}><span className="flex-1">All sales agents</span>{!selectedRepresentativeId && <Check />}</DropdownMenuItem>
            {representatives.map((representative) => <DropdownMenuItem key={representative.id} onClick={() => router.push(`/crm/leads?rep=${representative.id}`)}><span className="flex-1 truncate">{representative.full_name ?? representative.email ?? 'Unnamed sales agent'}</span>{selectedRepresentativeId === representative.id && <Check />}</DropdownMenuItem>)}
          </DropdownMenuGroup></DropdownMenuContent>
        </DropdownMenu>}
        {canAddLead && <NewLeadDialog defaultOpen={openNewLead} />}
      </div>
    </div>}

    <PaginatedTable
      key={`${statusFilter}-${paginationKey}`} embedded={embedded}
      header={<TableHeader><TableRow><TableHead>Company</TableHead><TableHead>Contact</TableHead><TableHead>Fleet</TableHead><TableHead>Account type</TableHead><TableHead>Source</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead>{showRepresentative && <TableHead>Sales agent</TableHead>}<TableHead>Next follow-up</TableHead><TableHead>Received</TableHead><TableHead>Est. gallons</TableHead></TableRow></TableHeader>}
      rows={filteredLeads.map((lead) => <TableRow key={lead.id} tabIndex={0} className="cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none" onClick={() => setSelectedLead(lead)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedLead(lead) } }}>
        <TableCell className="font-semibold">{lead.company_name ?? '—'}</TableCell><TableCell className="text-muted-foreground">{lead.contact_first_name} {lead.contact_last_name}</TableCell>
        <TableCell className="text-muted-foreground">{formatFleetSize(lead.fleet_size)}</TableCell><TableCell className="text-muted-foreground">{accountTypeLabels[lead.account_type]}</TableCell>
        <TableCell className="capitalize text-muted-foreground">{lead.source.replaceAll('_', ' ')}</TableCell><TableCell><LeadPriorityBadge priority={lead.priority} /></TableCell>
        <TableCell><Badge variant="outline" className={statusBadgeStyles[lead.status]}>{statusLabels[lead.status]}</Badge></TableCell>
        {showRepresentative && <TableCell>{lead.representative?.full_name ?? lead.representative?.email ?? 'Unassigned'}</TableCell>}
        <TableCell className="whitespace-nowrap text-muted-foreground">{lead.next_follow_up_at ? <LocalDateTime value={lead.next_follow_up_at} variant="compact" /> : 'Not scheduled'}</TableCell>
        <TableCell className={cn('font-semibold', receivedUrgencyClass(lead.created_at))}>{formatReceived(lead.created_at)}</TableCell><TableCell className="text-muted-foreground">{formatGallons(lead.estimated_monthly_gallons)}</TableCell>
      </TableRow>)}
      columnCount={showRepresentative ? 11 : 10} itemLabel="leads" emptyMessage="No leads match the current filters."
      totalItems={totalLeads} currentPage={page} initialPageSize={pageSize} pageSizes={[10, 25, 50, 100]}
      onPageChange={onPageChange} onPageSizeChange={onPageSizeChange}
    />

    {selectedLead && <LeadDetailsSheet lead={selectedLead} onOpenChange={(open) => !open && setSelectedLead(null)} onUpdated={() => { setSelectedLead(null); router.refresh() }} representatives={representatives} canAssignLeads={canAssignLeads} canManageWorkPlan={canManageWorkPlan} />}
  </div>
}

function LeadPriorityBadge({ priority }: { priority: LeadPriority }) {
  if (priority === 'urgent') return <Badge variant="destructive">Urgent</Badge>
  if (priority === 'high') return <Badge>High</Badge>
  if (priority === 'low') return <Badge variant="outline">Low</Badge>
  return <Badge variant="secondary">Normal</Badge>
}
function formatFleetSize(value: number | null | undefined) { return value == null ? '—' : `${value.toLocaleString()} ${value === 1 ? 'truck' : 'trucks'}` }
function formatGallons(value: number | null | undefined) { return value == null ? '—' : `${value.toLocaleString()} gal/mo` }
function formatReceived(createdAt: string) { const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000)); if (minutes < 1) return 'Just now'; if (minutes < 60) return `${minutes}m ago`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours}h ago`; const days = Math.floor(hours / 24); return days < 7 ? `${days}d ago` : new Date(createdAt).toLocaleDateString() }
function receivedUrgencyClass(createdAt: string) { const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000)); if (minutes <= 30) return 'text-success'; if (minutes <= 120) return 'text-pending'; return 'text-destructive' }

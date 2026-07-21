'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LeadWithRepresentative } from '@/app/actions/leads'
import { LeadStatus, Profile } from '@/types/database.types'
import { cn } from '@/lib/utils'
import { NewLeadDialog } from '@/components/crm/NewLeadDialog'

const statusLabels = {
  new: 'New',
  accepted: 'Accepted',
  rejected: 'Rejected',
  inserted_into_crm: 'In CRM',
}

type StatusFilter = 'all' | LeadStatus

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'inserted_into_crm', label: 'In CRM' },
]

interface LeadsTableProps {
  leads: LeadWithRepresentative[]
  showRepresentative: boolean
  representatives?: Profile[]
  selectedRepresentativeId?: string
  canAddLead?: boolean
  showFilters?: boolean
  openNewLead?: boolean
}

export function LeadsTable({
  leads,
  showRepresentative,
  representatives = [],
  selectedRepresentativeId,
  canAddLead = false,
  showFilters = false,
  openNewLead = false,
}: LeadsTableProps) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const filteredLeads = useMemo(
    () => statusFilter === 'all' ? leads : leads.filter((lead) => lead.status === statusFilter),
    [leads, statusFilter]
  )
  const selectedRepresentative = representatives.find((representative) => representative.id === selectedRepresentativeId)
  const representativeLabel = selectedRepresentative?.full_name ?? selectedRepresentative?.email ?? 'All representatives'

  const selectRepresentative = (representativeId: string) => {
    router.push(representativeId === 'all' ? '/crm/leads' : `/crm/leads?rep=${representativeId}`)
  }

  return (
    <div className="flex flex-col gap-4">
      {showFilters && <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" aria-label="Filter leads by status">
          {statusFilters.map((filter) => (
            <Button
              key={filter.value}
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={statusFilter === filter.value}
              className={cn(statusFilter === filter.value && 'border-primary bg-primary-dim text-primary hover:bg-primary-dim')}
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {showRepresentative && <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" className="min-w-48 justify-between" />}>
              <span className="truncate">{representativeLabel}</span>
              <ChevronDown data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Sales representative</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => selectRepresentative('all')}>
                  <span className="flex-1">All representatives</span>
                  {!selectedRepresentativeId && <Check />}
                </DropdownMenuItem>
                {representatives.map((representative) => (
                  <DropdownMenuItem key={representative.id} onClick={() => selectRepresentative(representative.id)}>
                    <span className="flex-1 truncate">{representative.full_name ?? representative.email ?? 'Unnamed representative'}</span>
                    {selectedRepresentativeId === representative.id && <Check />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>}
          {canAddLead && <NewLeadDialog defaultOpen={openNewLead} />}
        </div>
      </div>}

      <Card className="overflow-hidden py-0">
      <Table>
        <TableHeader className="bg-muted/45">
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Status</TableHead>
            {showRepresentative && <TableHead>Rep</TableHead>}
            <TableHead>Received</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredLeads.length ? filteredLeads.map((lead) => (
            <TableRow key={lead.id}>
              <TableCell className="font-semibold">{lead.company_name ?? '—'}</TableCell>
              <TableCell>
                <p className="font-medium">{lead.contact_first_name} {lead.contact_last_name}</p>
                <p className="text-xs text-muted-foreground">{lead.email ?? lead.phone}</p>
              </TableCell>
              <TableCell className="capitalize text-muted-foreground">{lead.source.replaceAll('_', ' ')}</TableCell>
              <TableCell>
                <Badge
                  variant={lead.status === 'rejected' ? 'destructive' : lead.status === 'new' ? 'outline' : 'secondary'}
                  className={cn(lead.status === 'new' && 'border-primary/20 bg-primary-dim text-primary')}
                >
                  {statusLabels[lead.status]}
                </Badge>
              </TableCell>
              {showRepresentative && <TableCell>{lead.representative?.full_name ?? lead.representative?.email ?? 'Unassigned'}</TableCell>}
              <TableCell className="text-muted-foreground">{formatReceived(lead.created_at)}</TableCell>
            </TableRow>
          )) : (
            <TableRow>
              <TableCell colSpan={showRepresentative ? 6 : 5} className="h-32 text-center text-muted-foreground">
                No leads match this status.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      </Card>
    </div>
  )
}

function formatReceived(createdAt: string) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000))
  if (elapsedMinutes < 1) return 'Just now'
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours}h ago`
  const elapsedDays = Math.floor(elapsedHours / 24)
  return elapsedDays < 7 ? `${elapsedDays}d ago` : new Date(createdAt).toLocaleDateString()
}

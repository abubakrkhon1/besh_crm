'use client'

import { useActionState, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, Clock, Loader2, Mail, Pencil, Phone, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { LeadWithRepresentative, updateLead, UpdateLeadState } from '@/app/actions/leads'
import { LeadAccountType, LeadStatus, Profile } from '@/types/database.types'
import { cn } from '@/lib/utils'
import { NewLeadDialog } from '@/components/crm/NewLeadDialog'
import { PaginatedTable } from '@/components/crm/ui/PaginatedTable'

const statusLabels = {
  new: 'New',
  successful: 'Successful',
  deal_lost: 'Deal Lost',
  on_the_process: 'On the Process',
  follow_up: 'Follow Up',
}

const statusBadgeStyles: Record<LeadStatus, string> = {
  new: 'border-status-new-foreground/15 bg-status-new text-status-new-foreground',
  on_the_process: 'border-status-process-foreground/15 bg-status-process text-status-process-foreground',
  follow_up: 'border-status-follow-up-foreground/15 bg-status-follow-up text-status-follow-up-foreground',
  successful: 'border-status-success-foreground/15 bg-status-success text-status-success-foreground',
  deal_lost: 'border-status-lost-foreground/15 bg-status-lost text-status-lost-foreground',
}

const accountTypeLabels: Record<LeadAccountType, string> = {
  prepaid_account: 'Prepaid Account',
  deposit: 'Deposit',
  credit_line: 'Credit Line',
}

type StatusFilter = 'all' | LeadStatus

const statusFilters: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'on_the_process', label: 'On the Process' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'successful', label: 'Successful' },
  { value: 'deal_lost', label: 'Deal Lost' },
]

interface LeadsTableProps {
  leads: LeadWithRepresentative[]
  showRepresentative: boolean
  embedded?: boolean
  paginationKey?: string
  representatives?: Profile[]
  selectedRepresentativeId?: string
  canAddLead?: boolean
  showFilters?: boolean
  openNewLead?: boolean
}

export function LeadsTable({
  leads,
  showRepresentative,
  embedded = false,
  paginationKey = '',
  representatives = [],
  selectedRepresentativeId,
  canAddLead = false,
  showFilters = false,
  openNewLead = false,
}: LeadsTableProps) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedLead, setSelectedLead] = useState<LeadWithRepresentative | null>(null)
  const filteredLeads = useMemo(
    () => statusFilter === 'all' ? leads : leads.filter((lead) => lead.status === statusFilter),
    [leads, statusFilter]
  )
  const selectedRepresentative = representatives.find((representative) => representative.id === selectedRepresentativeId)
  const representativeLabel = selectedRepresentative?.full_name ?? selectedRepresentative?.email ?? 'All sales agents'

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
          {showRepresentative && representatives.length > 0 && <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" className="min-w-48 justify-between" />}>
              <span className="truncate">{representativeLabel}</span>
              <ChevronDown data-icon="inline-end" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Sales agent</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => selectRepresentative('all')}>
                  <span className="flex-1">All sales agents</span>
                  {!selectedRepresentativeId && <Check />}
                </DropdownMenuItem>
                {representatives.map((representative) => (
                  <DropdownMenuItem key={representative.id} onClick={() => selectRepresentative(representative.id)}>
                    <span className="flex-1 truncate">{representative.full_name ?? representative.email ?? 'Unnamed sales agent'}</span>
                    {selectedRepresentativeId === representative.id && <Check />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>}
          {canAddLead && <NewLeadDialog defaultOpen={openNewLead} />}
        </div>
      </div>}

      <PaginatedTable
        key={`${statusFilter}-${paginationKey}`}
        embedded={embedded}
        header={<TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Fleet</TableHead>
            <TableHead>Account type</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Status</TableHead>
            {showRepresentative && <TableHead>Sales agent</TableHead>}
            <TableHead>Received</TableHead>
            <TableHead>Est. gallons</TableHead>
          </TableRow>
        </TableHeader>}
        rows={filteredLeads.map((lead) => (
            <TableRow
              key={lead.id}
              tabIndex={0}
              className="cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none"
              onClick={() => setSelectedLead(lead)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedLead(lead)
                }
              }}
            >
              <TableCell className="font-semibold">{lead.company_name ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground">{lead.contact_first_name} {lead.contact_last_name}</TableCell>
              <TableCell className="text-muted-foreground">{formatFleetSize(lead.fleet_size)}</TableCell>
              <TableCell className="text-muted-foreground">{accountTypeLabels[lead.account_type]}</TableCell>
              <TableCell className="capitalize text-muted-foreground">{lead.source.replaceAll('_', ' ')}</TableCell>
              <TableCell>
                <Badge variant="outline" className={statusBadgeStyles[lead.status]}>
                  {statusLabels[lead.status]}
                </Badge>
              </TableCell>
              {showRepresentative && <TableCell>{lead.representative?.full_name ?? lead.representative?.email ?? 'Unassigned'}</TableCell>}
              <TableCell className={cn('font-semibold', receivedUrgencyClass(lead.created_at))}>{formatReceived(lead.created_at)}</TableCell>
              <TableCell className="text-muted-foreground">{formatGallons(lead.estimated_monthly_gallons)}</TableCell>
            </TableRow>
          ))}
        columnCount={showRepresentative ? 9 : 8}
        itemLabel="leads"
        emptyMessage="No leads match the current filters."
      />

      <LeadDetailsSheet
        lead={selectedLead}
        onOpenChange={(open) => !open && setSelectedLead(null)}
        onUpdated={() => {
          setSelectedLead(null)
          router.refresh()
        }}
      />
    </div>
  )
}

function LeadDetailsSheet({
  lead,
  onOpenChange,
  onUpdated,
}: {
  lead: LeadWithRepresentative | null
  onOpenChange: (open: boolean) => void
  onUpdated: () => void
}) {
  if (!lead) return null

  return <LeadDetailsSheetContent lead={lead} onOpenChange={onOpenChange} onUpdated={onUpdated} />
}

function LeadDetailsSheetContent({
  lead,
  onOpenChange,
  onUpdated,
}: {
  lead: LeadWithRepresentative
  onOpenChange: (open: boolean) => void
  onUpdated: () => void
}) {
  const [isEditing, setIsEditing] = useState(false)

  const contactName = `${lead.contact_first_name} ${lead.contact_last_name}`.trim()
  const statusDate = getLeadStatusDate(lead)

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 sm:max-w-[380px]">
        <SheetHeader className="border-b pr-14">
          <div className="flex flex-col gap-2">
            <div>
              <SheetTitle>{lead.company_name ?? contactName}</SheetTitle>
              <SheetDescription>{lead.company_name ? contactName : lead.email ?? lead.phone}</SheetDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LeadStatusBadge status={lead.status} />
              <span className="text-xs font-semibold text-muted-foreground">Received {formatReceived(lead.created_at)}</span>
            </div>
          </div>
        </SheetHeader>

        {isEditing ? (
          <EditLeadForm lead={lead} onCancel={() => setIsEditing(false)} onSuccess={onUpdated} />
        ) : <Tabs defaultValue="overview" className="min-h-0 flex-1 gap-0">
          <TabsList variant="line" className="h-11 w-full justify-start rounded-none border-b px-5">
            <TabsTrigger value="overview" className="flex-none px-1.5">Overview</TabsTrigger>
            <TabsTrigger value="activity" className="flex-none px-1.5">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="overflow-y-auto p-5">
            <div className="flex flex-col gap-5">
              <div className={cn('grid gap-2', lead.phone && lead.email ? 'grid-cols-3' : 'grid-cols-2')}>
                  {lead.phone && (
                    <a href={`tel:${lead.phone}`} className={buttonVariants()}>
                      <Phone data-icon="inline-start" />
                      Call
                    </a>
                  )}
                  {lead.email && (
                    <a href={`mailto:${lead.email}`} className={buttonVariants({ variant: 'outline' })}>
                      <Mail data-icon="inline-start" />
                      Email
                    </a>
                  )}
                  <Button type="button" variant="outline" onClick={() => setIsEditing(true)}>
                    <Pencil data-icon="inline-start" />
                    Edit
                  </Button>
                </div>

              <DetailSection title="Contact">
                <DetailRow label="Name" value={contactName} />
                <DetailRow label="Email" value={lead.email ?? '—'} />
                <DetailRow label="Phone" value={lead.phone ?? '—'} />
              </DetailSection>

              <DetailSection title="Lead details">
                <DetailRow label="Fleet size" value={formatFleetSize(lead.fleet_size)} />
                <DetailRow label="Preferred network" value={lead.preferred_network ?? '—'} />
                <DetailRow label="Est. monthly gallons" value={formatGallons(lead.estimated_monthly_gallons)} />
                <DetailRow label="Account type" value={accountTypeLabels[lead.account_type]} />
                <DetailRow label="Source" value={formatLabel(lead.source)} />
                <DetailRow label="Assigned sales agent" value={lead.representative?.full_name ?? lead.representative?.email ?? 'Unassigned'} />
                <DetailRow label="Received" value={formatDateTime(lead.created_at)} />
              </DetailSection>

              {lead.notes && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.03em] text-muted-foreground">Notes</h3>
                  <p className="whitespace-pre-wrap rounded-md bg-muted p-3 text-[13px] leading-relaxed">{lead.notes}</p>
                </section>
              )}
            </div>
          </TabsContent>

          <TabsContent value="activity" className="overflow-y-auto p-5">
            <div className="flex flex-col gap-4">
              <ActivityItem icon={UserRound} title="Lead created" detail={`via ${formatLabel(lead.source)}`} date={lead.created_at} />
              {statusDate && (
                <ActivityItem icon={Clock} title={`Marked ${statusLabels[lead.status]}`} detail="Status updated" date={statusDate} />
              )}
              {!statusDate && <p className="text-sm text-muted-foreground">No status changes have been recorded yet.</p>}
            </div>
          </TabsContent>
        </Tabs>}
      </SheetContent>
    </Sheet>
  )
}

const initialUpdateLeadState: UpdateLeadState = {}

function EditLeadForm({
  lead,
  onCancel,
  onSuccess,
}: {
  lead: LeadWithRepresentative
  onCancel: () => void
  onSuccess: () => void
}) {
  const [state, formAction, pending] = useActionState(updateLead, initialUpdateLeadState)
  const errors = state.fieldErrors ?? {}

  useEffect(() => {
    if (state.success) onSuccess()
  }, [state.success, onSuccess])

  return (
    <form action={formAction} noValidate className="flex min-h-0 flex-1 flex-col">
      <input type="hidden" name="leadId" value={lead.id} />
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <FieldGroup className="gap-4">
          <div className="grid grid-cols-2 gap-3">
            <EditField id="edit-lead-first-name" label="First name" name="firstName" defaultValue={lead.contact_first_name} errors={errors.firstName} required />
            <EditField id="edit-lead-last-name" label="Last name" name="lastName" defaultValue={lead.contact_last_name} errors={errors.lastName} required />
          </div>
          <EditField id="edit-lead-company" label="Company" name="companyName" defaultValue={lead.company_name ?? ''} errors={errors.companyName} />
          <EditField id="edit-lead-email" label="Email" name="email" type="email" defaultValue={lead.email ?? ''} errors={errors.email} />
          <EditField id="edit-lead-phone" label="Phone" name="phone" type="tel" defaultValue={lead.phone ?? ''} errors={errors.phone} />

          <Field data-invalid={Boolean(errors.status)}>
            <FieldLabel htmlFor="edit-lead-status">Status</FieldLabel>
            <NativeSelect className="w-full" id="edit-lead-status" name="status" defaultValue={lead.status} aria-invalid={Boolean(errors.status)}>
              {statusFilters.filter((status) => status.value !== 'all').map((status) => (
                <NativeSelectOption key={status.value} value={status.value}>{status.label}</NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError errors={errors.status?.map((message) => ({ message }))} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <EditField id="edit-lead-fleet" label="Fleet size" name="fleetSize" type="number" min="0" defaultValue={lead.fleet_size ?? ''} errors={errors.fleetSize} />
            <EditField id="edit-lead-gallons" label="Est. gallons" name="estimatedMonthlyGallons" type="number" min="0" defaultValue={lead.estimated_monthly_gallons ?? ''} errors={errors.estimatedMonthlyGallons} />
          </div>
          <EditField id="edit-lead-network" label="Preferred network" name="preferredNetwork" defaultValue={lead.preferred_network ?? ''} errors={errors.preferredNetwork} />

          <Field data-invalid={Boolean(errors.accountType)}>
            <FieldLabel htmlFor="edit-lead-account-type">Account type</FieldLabel>
            <NativeSelect className="w-full" id="edit-lead-account-type" name="accountType" defaultValue={lead.account_type} aria-invalid={Boolean(errors.accountType)}>
              {Object.entries(accountTypeLabels).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError errors={errors.accountType?.map((message) => ({ message }))} />
          </Field>

          <EditField id="edit-lead-source" label="Source" name="source" defaultValue={lead.source} errors={errors.source} />
          <Field data-invalid={Boolean(errors.notes)}>
            <FieldLabel htmlFor="edit-lead-notes">Notes</FieldLabel>
            <Textarea id="edit-lead-notes" name="notes" defaultValue={lead.notes ?? ''} aria-invalid={Boolean(errors.notes)} />
            <FieldError errors={errors.notes?.map((message) => ({ message }))} />
          </Field>
          {state.error && <FieldError>{state.error}</FieldError>}
        </FieldGroup>
      </div>
      <SheetFooter className="shrink-0 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 data-icon="inline-start" className="animate-spin" />}
          {pending ? 'Saving' : 'Save changes'}
        </Button>
      </SheetFooter>
    </form>
  )
}

function EditField({
  id,
  label,
  errors,
  ...props
}: React.ComponentProps<typeof Input> & { id: string; label: string; errors?: string[] }) {
  const invalid = Boolean(errors?.length)
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} aria-invalid={invalid} {...props} />
      <FieldError errors={errors?.map((message) => ({ message }))} />
    </Field>
  )
}

function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return (
    <Badge variant="outline" className={statusBadgeStyles[status]}>
      {statusLabels[status]}
    </Badge>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.03em] text-muted-foreground">{title}</h3>
      <div className="flex flex-col">{children}</div>
    </section>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4 py-2 text-[13px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="max-w-[62%] text-right font-semibold break-words">{value}</span>
      </div>
      <Separator />
    </div>
  )
}

function ActivityItem({ icon: Icon, title, detail, date }: { icon: typeof Clock; title: string; detail: string; date: string }) {
  return (
    <div className="flex gap-2.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-dim text-primary">
        <Icon className="size-3.5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{detail} · {formatDateTime(date)}</p>
      </div>
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function formatFleetSize(value: number | null | undefined) {
  if (value == null) return '—'
  return `${value.toLocaleString()} ${value === 1 ? 'truck' : 'trucks'}`
}

function formatGallons(value: number | null | undefined) {
  return value == null ? '—' : `${value.toLocaleString()} gal/mo`
}

function getLeadStatusDate(lead: LeadWithRepresentative) {
  if (lead.status === 'successful') return lead.successful_at
  if (lead.status === 'deal_lost') return lead.deal_lost_at
  if (lead.status === 'on_the_process') return lead.on_the_process_at
  if (lead.status === 'follow_up') return lead.follow_up_at
  return null
}

function receivedUrgencyClass(createdAt: string) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000))
  if (elapsedMinutes <= 30) return 'text-success'
  if (elapsedMinutes <= 120) return 'text-pending'
  return 'text-destructive'
}

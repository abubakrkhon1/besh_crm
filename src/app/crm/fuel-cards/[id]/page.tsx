import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Building2, CheckCircle2, CreditCard, Mail, Phone, RefreshCw, ShieldCheck, Snowflake, Truck, UserRound } from 'lucide-react'
import { CustomerAssignment } from '@/components/crm/CustomerAssignment'
import { FuelCardSyncButton } from '@/components/crm/FuelCardControls'
import { PaginatedTable } from '@/components/crm/ui/PaginatedTable'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

type RelatedCustomer = { id: string; company_name: string | null; contact_name: string | null }
type RelatedDriver = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; license_number: string | null; status: string; created_at: string }

export default async function FuelCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()
  const [{ data: card }, { data: customers }, { data: mapping }, { data: transactions }, { data: restriction }, { data: sync }] = await Promise.all([
    db.from('fuel_cards').select('id,card_last4,provider,customer_id,driver_id,status,driver_name,external_driver_id,unit_number,policy_number,payroll_status,payroll_use,is_overridden,override_code,gps_id,vin,zone_id,last_synced_at,daily_limit,weekly_limit,monthly_limit,gallon_limit,customers(id,company_name,contact_name),drivers(id,first_name,last_name,email,phone,license_number,status,created_at)').eq('id', id).single(),
    db.from('customers').select('id,company_name,contact_name').order('company_name'),
    db.from('fuel_card_customer_mappings').select('match_method,match_confidence,is_confirmed,confirmed_at').eq('fuel_card_id', id).maybeSingle(),
    db.from('fuel_transactions').select('id,transaction_date,merchant_name,merchant_address,merchant_state,gallons,amount,savings,status,provider_transaction_type').eq('fuel_card_id', id).order('transaction_date', { ascending: false }).limit(25),
    db.from('fuel_card_restrictions').select('fuel_only,allow_def,allow_maintenance,allowed_states,blocked_states,allowed_merchants,blocked_merchants,start_time,end_time').eq('fuel_card_id', id).maybeSingle(),
    db.from('fuel_card_sync_runs').select('completed_at,cards_received,cards_unmatched').eq('provider', 'wex_efs').eq('status', 'succeeded').order('completed_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  if (!card) notFound()

  const customer = oneRelation(card.customers) as RelatedCustomer | null
  const driver = oneRelation(card.drivers) as RelatedDriver | null
  const customerOptions = (customers ?? []).map((option) => ({ id: option.id, name: option.company_name ?? option.contact_name ?? 'Unnamed customer' }))
  const status = normalizeStatus(card.status)
  const syncDate = sync?.completed_at ?? card.last_synced_at
  const healthyCutoff = new Date()
  healthyCutoff.setUTCDate(healthyCutoff.getUTCDate() - 1)
  const syncHealthy = Date.parse(syncDate) >= healthyCutoff.getTime()
  const customerDisplayName = customer?.company_name ?? customer?.contact_name ?? 'Unmatched'
  const driverDisplayName = card.driver_name ?? (driver ? `${driver.first_name} ${driver.last_name}` : 'Unassigned')
  const details: DetailField[][] = [
    [
      { label: 'Status', value: <CardStatusBadge status={card.status} /> },
      { label: 'External driver ID', value: card.external_driver_id },
      { label: 'Payroll status', value: card.payroll_status },
      { label: 'VIN', value: card.vin },
      { label: 'Provider', value: formatLabel(card.provider) },
    ],
    [
      { label: 'Assigned customer', value: customer ? <Link href={`/crm/customers/${customer.id}`} className="font-semibold text-primary hover:underline">{customerDisplayName}</Link> : 'Unmatched' },
      { label: 'Unit number', value: card.unit_number },
      { label: 'Payroll use', value: card.payroll_use },
      { label: 'GPS ID', value: card.gps_id },
      { label: 'Last synchronized', value: formatDateTime(card.last_synced_at) },
    ],
    [
      { label: 'Driver', value: driverDisplayName },
      { label: 'Policy number', value: card.policy_number },
      { label: 'Override', value: card.is_overridden ? `Yes${card.override_code ? ` (${card.override_code})` : ''}` : 'No' },
      { label: 'Zone ID', value: card.zone_id },
      { label: 'WEX sync state', value: syncHealthy ? 'Current' : 'Needs refresh' },
    ],
  ]

  return (
    <div className="flex animate-fade-in flex-col gap-4 pb-12">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/crm/fuel-cards" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ml-3')}>
          <ArrowLeft data-icon="inline-start" />
          Fuel Cards
        </Link>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Button type="button" variant="outline" size="lg" disabled title="Card-status mutations are not connected to WEX yet.">
            <Snowflake data-icon="inline-start" />
            {status === 'frozen' ? 'Unfreeze card' : 'Freeze card'}
          </Button>
          <Link href="#customer-assignment" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            <Building2 data-icon="inline-start" />
            Edit assignment
          </Link>
          <FuelCardSyncButton label="Sync now" />
        </div>
      </div>
      <header className="grid min-w-0 gap-4 xl:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)] xl:items-stretch">
        <div className="min-w-0">
          <h1 className="sr-only">Fuel card ending {card.card_last4 ?? 'unknown'}</h1>
          <div className="relative min-h-44 w-full overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary to-chart-3 p-5 text-primary-foreground shadow-lg" aria-label={`Fuel card ending ${card.card_last4 ?? 'unknown'}`}>
            <div className="absolute -right-12 -top-16 size-44 rounded-full bg-primary-foreground/10" aria-hidden="true" />
            <div className="absolute -bottom-20 -left-14 size-48 rounded-full bg-primary-foreground/10" aria-hidden="true" />
            <div className="relative flex h-full min-h-36 flex-col justify-between gap-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary-foreground/15"><CreditCard className="size-5" aria-hidden="true" /></div>
                  <div><p className="text-sm font-bold tracking-wide">BESH FUEL</p><p className="text-[10px] text-primary-foreground/70">WEX / EFS</p></div>
                </div>
                <Badge variant="secondary">{formatLabel(card.status)}</Badge>
              </div>
              <p className="font-mono text-2xl font-semibold tracking-[0.14em] sm:text-3xl">•••• •••• •••• {card.card_last4 ?? '——'}</p>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 text-[10px] uppercase tracking-wider text-primary-foreground/65">
                <div className="min-w-0"><p>Assigned customer</p><p className="truncate text-xs font-semibold normal-case tracking-normal text-primary-foreground">{customerDisplayName}</p></div>
                <div><p>Unit</p><p className="text-xs font-semibold normal-case tracking-normal text-primary-foreground">{card.unit_number ?? '—'}</p></div>
              </div>
            </div>
          </div>
        </div>
        <div className="grid min-w-0 auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryItem label="Status" value={formatLabel(card.status)} icon={<CheckCircle2 />} tone="green" />
          <SummaryItem label="Assigned customer" value={customerDisplayName} icon={<Building2 />} tone="violet" href={customer ? `/crm/customers/${customer.id}` : undefined} />
          <SummaryItem label="Driver" value={driverDisplayName} icon={<UserRound />} tone="blue" />
          <SummaryItem label="Unit number" value={card.unit_number ?? '—'} icon={<Truck />} tone="orange" />
          <SummaryItem label="Policy" value={card.policy_number ?? '—'} icon={<ShieldCheck />} tone="blue" />
          <SummaryItem label="Last synced" value={formatShortDateTime(card.last_synced_at)} icon={<RefreshCw />} tone="green" />
        </div>
      </header>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <main className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Card details</CardTitle>
              <CardDescription>Provider-controlled card information from the latest WEX synchronization.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 lg:grid-cols-3">
              {details.map((column, index) => (
                <div key={index} className={cn('flex min-w-0 flex-col', index > 0 && 'lg:border-l lg:pl-6')}>
                  {column.map((field, fieldIndex) => <DetailRow key={field.label} {...field} last={fieldIndex === column.length - 1} />)}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card id="customer-assignment" className="scroll-mt-24">
            <CardHeader>
              <CardTitle>Customer assignment</CardTitle>
              <CardDescription>{mapping ? `${mapping.is_confirmed ? 'Confirmed' : 'Automatic'} ${formatLabel(mapping.match_method)} match with ${formatLabel(mapping.match_confidence)} confidence.` : 'No confirmed mapping. Assign only after verifying the customer.'}</CardDescription>
            </CardHeader>
            <CardContent>
              <CustomerAssignment cardId={card.id} currentId={card.customer_id} customers={customerOptions} />
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Recent card activity</CardTitle>
              <CardDescription>Latest transactions posted to this fuel card.</CardDescription>
              <CardAction><Link href={`/crm/transactions?card=${card.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>View full transactions</Link></CardAction>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <PaginatedTable
                embedded
                header={<TableHeader><TableRow><TableHead className="pl-5">Date / time</TableHead><TableHead>Merchant</TableHead><TableHead>Location</TableHead><TableHead>Gallons</TableHead><TableHead>Amount</TableHead><TableHead>Savings</TableHead><TableHead className="pr-5">Status</TableHead></TableRow></TableHeader>}
                rows={(transactions ?? []).map((transaction) => <TableRow key={transaction.id}>
                  <TableCell className="whitespace-nowrap pl-5 text-muted-foreground">{formatDateTime(transaction.transaction_date)}</TableCell>
                  <TableCell className="max-w-48 truncate font-semibold">{transaction.merchant_name ?? 'Unknown merchant'}</TableCell>
                  <TableCell className="max-w-44 truncate">{[transaction.merchant_address, transaction.merchant_state].filter(Boolean).join(', ') || '—'}</TableCell>
                  <TableCell className="tabular-nums">{transaction.gallons == null ? '—' : Number(transaction.gallons).toLocaleString(undefined, { maximumFractionDigits: 3 })}</TableCell>
                  <TableCell className="font-semibold tabular-nums">{formatCurrency(transaction.amount)}</TableCell>
                  <TableCell className="tabular-nums text-status-success-foreground">{formatCurrency(transaction.savings)}</TableCell>
                  <TableCell className="pr-5"><TransactionStatusBadge status={transaction.status} /></TableCell>
                </TableRow>)}
                columnCount={7}
                itemLabel="transactions"
                emptyMessage="No transactions are linked to this card."
                initialPageSize={5}
                pageSizes={[5, 10, 25]}
              />
            </CardContent>
          </Card>
        </main>

        <aside className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader><CardTitle>Sync health</CardTitle><CardDescription>WEX inventory synchronization status.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className={cn('flex items-center gap-2 text-sm font-semibold', syncHealthy ? 'text-status-success-foreground' : 'text-status-follow-up-foreground')}>
                {syncHealthy ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
                {syncHealthy ? 'All systems operational' : 'Synchronization needs attention'}
              </div>
              <div><p className="text-xs text-muted-foreground">Last successful sync</p><p className="mt-1 text-sm font-semibold">{formatDateTime(syncDate)}</p></div>
              {sync && <p className="text-xs text-muted-foreground">{sync.cards_received.toLocaleString()} cards received · {sync.cards_unmatched.toLocaleString()} unmatched</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Driver profile</CardTitle><CardDescription>Current driver assignment for this card.</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Avatar><AvatarFallback className="bg-primary text-primary-foreground">{initials(driverDisplayName)}</AvatarFallback></Avatar>
                <div className="min-w-0"><p className="truncate font-semibold">{driverDisplayName}</p><p className="text-xs text-muted-foreground">{driver ? formatLabel(driver.status) : 'WEX card assignment'}</p></div>
              </div>
              {driver?.phone && <ProfileLine icon={<Phone />} value={driver.phone} href={`tel:${driver.phone}`} />}
              {driver?.email && <ProfileLine icon={<Mail />} value={driver.email} href={`mailto:${driver.email}`} />}
              <ProfileLine icon={<CreditCard />} value={driver?.license_number ? `License # ${driver.license_number}` : `Driver ID ${card.external_driver_id ?? '—'}`} />
              {driver && <ProfileLine icon={<UserRound />} value={`Added ${formatDate(driver.created_at)}`} />}
              {!driver && <p className="text-xs leading-relaxed text-muted-foreground">No internal driver profile is linked. Driver information is displayed from the WEX card record.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Policy summary</CardTitle><CardDescription>Card limits and product restrictions.</CardDescription></CardHeader>
            <CardContent className="flex flex-col">
              <PolicyRow label="Policy number" value={card.policy_number ?? '—'} />
              <PolicyRow label="Daily spend limit" value={Number(card.daily_limit) ? formatCurrency(card.daily_limit) : 'Not set'} />
              <PolicyRow label="Weekly spend limit" value={Number(card.weekly_limit) ? formatCurrency(card.weekly_limit) : 'Not set'} />
              <PolicyRow label="Monthly spend limit" value={Number(card.monthly_limit) ? formatCurrency(card.monthly_limit) : 'Not set'} />
              <PolicyRow label="Gallon limit" value={Number(card.gallon_limit) ? `${Number(card.gallon_limit).toLocaleString()} gal` : 'Not set'} />
              <PolicyRow label="Products" value={restriction ? productSummary(restriction) : 'No restrictions stored'} last />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}

type DetailField = { label: string; value: React.ReactNode }
type SummaryTone = 'green' | 'violet' | 'blue' | 'orange'

const summaryToneStyles: Record<SummaryTone, string> = {
  green: 'bg-status-success text-status-success-foreground',
  violet: 'bg-status-process text-status-process-foreground',
  blue: 'bg-status-new text-status-new-foreground',
  orange: 'bg-status-follow-up text-status-follow-up-foreground',
}

function SummaryItem({ label, value, icon, tone, href }: { label: string; value: string; icon: React.ReactNode; tone: SummaryTone; href?: string }) {
  return <Card size="sm" className="h-full min-h-20 min-w-0 justify-center shadow-sm transition-shadow hover:shadow-md">
    <CardHeader className="grid-cols-[minmax(0,1fr)_auto] px-4">
      <CardTitle className="truncate text-xs font-medium text-muted-foreground">{label}</CardTitle>
      <CardAction className={cn('flex size-8 items-center justify-center rounded-lg [&_svg]:size-4', summaryToneStyles[tone])}>{icon}</CardAction>
    </CardHeader>
    <CardContent className="min-w-0 px-4">
      {href ? <Link href={href} title={value} className="block truncate text-sm font-semibold text-primary hover:underline">{value}</Link> : <p title={value} className="truncate text-sm font-semibold">{value}</p>}
    </CardContent>
  </Card>
}

function DetailRow({ label, value, last = false }: DetailField & { last?: boolean }) {
  return <div><div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] items-start gap-3 py-2.5 text-sm"><span className="text-muted-foreground">{label}</span><span className="min-w-0 break-words font-medium">{value || '—'}</span></div>{!last && <Separator />}</div>
}

function ProfileLine({ icon, value, href }: { icon: React.ReactNode; value: string; href?: string }) {
  const content = <>{icon}<span className="min-w-0 truncate">{value}</span></>
  return href ? <a href={href} className="flex items-center gap-2 text-sm hover:underline [&_svg]:size-4 [&_svg]:shrink-0">{content}</a> : <div className="flex items-center gap-2 text-sm [&_svg]:size-4 [&_svg]:shrink-0">{content}</div>
}

function PolicyRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return <div><div className="flex items-start justify-between gap-4 py-2 text-sm"><span className="text-muted-foreground">{label}</span><span className="max-w-[58%] text-right font-medium">{value}</span></div>{!last && <Separator />}</div>
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

function TransactionStatusBadge({ status }: { status: string }) {
  const normalized = normalizeStatus(status)
  return <Badge variant="outline" className={cn(
    normalized === 'posted' && 'border-status-success-foreground/15 bg-status-success text-status-success-foreground',
    normalized === 'pending' && 'border-status-follow-up-foreground/15 bg-status-follow-up text-status-follow-up-foreground',
    ['declined', 'reversed'].includes(normalized) && 'border-destructive/15 bg-destructive/10 text-destructive',
  )}>{formatLabel(status)}</Badge>
}

function oneRelation(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown> | undefined) ?? null
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function productSummary(restriction: { fuel_only: boolean; allow_def: boolean; allow_maintenance: boolean }) {
  const products = [restriction.fuel_only && 'Fuel', restriction.allow_def && 'DEF', restriction.allow_maintenance && 'Maintenance'].filter(Boolean)
  return products.join(', ') || 'None'
}

function normalizeStatus(value: string) { return value.trim().toLowerCase().replaceAll(' ', '_') }
function formatLabel(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) }
function formatCurrency(value: number | string | null | undefined) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value ?? 0)) }
function formatDateTime(value: string) { return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
function formatShortDateTime(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value)) }
function initials(value: string) { return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'FC' }

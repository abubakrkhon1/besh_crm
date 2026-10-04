import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { FuelCardLimitsDialog, FuelCardStatusControl, ReplaceFuelCardDialog } from '@/components/crm/FuelCardManagementControls'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LocalDateTime } from '@/components/ui/local-date-time'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createClient, requireCustomerPortalProfile } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export default async function PortalFuelCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { profile } = await requireCustomerPortalProfile()
  if (!profile?.customer_id) return null
  const db = await createClient()
  const [{ data: card }, { data: transactions }, { data: operations }] = await Promise.all([
    db.from('customer_portal_fuel_cards').select('id,card_last4,status,driver_name,external_driver_id,unit_number,policy_number,daily_limit,weekly_limit,monthly_limit,daily_transaction_limit,weekly_transaction_limit,monthly_transaction_limit,last_synced_at').eq('id', id).eq('customer_id', profile.customer_id).maybeSingle(),
    db.from('customer_portal_fuel_transactions').select('id,transaction_date,merchant_name,merchant_city,merchant_state,gallons,amount,status').eq('fuel_card_id', id).eq('customer_id', profile.customer_id).order('transaction_date', { ascending: false }).limit(25),
    db.from('customer_portal_card_operations').select('id,operation_type,status,requested_at,completed_at').eq('fuel_card_id', id).eq('customer_id', profile.customer_id).order('requested_at', { ascending: false }).limit(10),
  ])
  if (!card) notFound()

  return (
    <div className="flex flex-col gap-6">
      <div><Link href="/portal/fuel-cards" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ml-3')}><ArrowLeft data-icon="inline-start" />Fuel Cards</Link></div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="text-2xl font-semibold tracking-tight">Card ending {card.card_last4 ?? '—'}</h2><p className="mt-1 text-sm text-muted-foreground">{card.driver_name ?? 'Unassigned'}{card.unit_number ? ` · Unit ${card.unit_number}` : ''}</p></div>
        <div className="flex flex-wrap gap-2"><FuelCardStatusControl cardId={card.id} status={card.status} /><ReplaceFuelCardDialog cardId={card.id} cardLast4={card.card_last4} /><FuelCardLimitsDialog cardId={card.id} current={{ dailyAmount: numberOrNull(card.daily_limit), weeklyAmount: numberOrNull(card.weekly_limit), monthlyAmount: numberOrNull(card.monthly_limit), dailyTransactions: numberOrNull(card.daily_transaction_limit), weeklyTransactions: numberOrNull(card.weekly_transaction_limit), monthlyTransactions: numberOrNull(card.monthly_transaction_limit) }} /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DetailCard label="Status" value={<Badge variant={card.status.toUpperCase() === 'ACTIVE' ? 'default' : 'secondary'}>{card.status}</Badge>} />
        <DetailCard label="Driver ID" value={card.external_driver_id ?? '—'} />
        <DetailCard label="Policy" value={card.policy_number ?? '—'} />
        <DetailCard label="Last synchronized" value={<LocalDateTime value={card.last_synced_at} />} />
      </div>
      <Card>
        <CardHeader><CardTitle>Recent transactions</CardTitle><CardDescription>Latest purchases posted to this card.</CardDescription></CardHeader>
        <CardContent className="px-0"><Table><TableHeader><TableRow><TableHead className="pl-6">Date</TableHead><TableHead>Merchant</TableHead><TableHead>Location</TableHead><TableHead>Gallons</TableHead><TableHead>Status</TableHead><TableHead className="pr-6 text-right">Amount</TableHead></TableRow></TableHeader><TableBody>
          {(transactions ?? []).map((transaction) => <TableRow key={transaction.id}><TableCell className="pl-6 text-muted-foreground"><LocalDateTime value={transaction.transaction_date} /></TableCell><TableCell>{transaction.merchant_name ?? 'Fuel purchase'}</TableCell><TableCell>{[transaction.merchant_city, transaction.merchant_state].filter(Boolean).join(', ') || '—'}</TableCell><TableCell>{transaction.gallons == null ? '—' : Number(transaction.gallons).toFixed(2)}</TableCell><TableCell><Badge variant="secondary">{transaction.status}</Badge></TableCell><TableCell className="pr-6 text-right font-medium">{formatCurrency(Number(transaction.amount ?? 0))}</TableCell></TableRow>)}
          {!transactions?.length && <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">No transactions found for this card.</TableCell></TableRow>}
        </TableBody></Table></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Management history</CardTitle><CardDescription>Audited card changes requested for this card.</CardDescription></CardHeader>
        <CardContent className="px-0"><Table><TableHeader><TableRow><TableHead className="pl-6">Requested</TableHead><TableHead>Action</TableHead><TableHead>Status</TableHead><TableHead className="pr-6">Details</TableHead></TableRow></TableHeader><TableBody>
          {(operations ?? []).map((operation) => <TableRow key={operation.id}><TableCell className="pl-6 text-muted-foreground"><LocalDateTime value={operation.requested_at} /></TableCell><TableCell>{operation.operation_type.replaceAll('_', ' ')}</TableCell><TableCell><Badge variant="secondary">{operation.status.replaceAll('_', ' ')}</Badge></TableCell><TableCell className="pr-6 text-muted-foreground">{operation.completed_at ? 'Completed' : 'In progress'}</TableCell></TableRow>)}
          {!operations?.length && <TableRow><TableCell colSpan={4} className="h-24 text-center text-muted-foreground">No card changes have been requested.</TableCell></TableRow>}
        </TableBody></Table></CardContent>
      </Card>
    </div>
  )
}

function DetailCard({ label, value }: { label: string; value: React.ReactNode }) {
  return <Card><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-base">{value}</CardTitle></CardHeader></Card>
}

function numberOrNull(value: number | string | null) { return value == null ? null : Number(value) }
function formatCurrency(value: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value) }

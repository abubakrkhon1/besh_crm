import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LocalDateTime } from '@/components/ui/local-date-time'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createClient, requireCustomerPortalProfile } from '@/lib/supabase/server'

export default async function PortalFuelCardsPage() {
  const { profile } = await requireCustomerPortalProfile()
  if (!profile?.customer_id) return null
  const db = await createClient()
  const { data: cards, error } = await db.from('customer_portal_fuel_cards')
    .select('id,card_last4,status,driver_name,external_driver_id,unit_number,policy_number,daily_limit,weekly_limit,monthly_limit,last_synced_at')
    .eq('customer_id', profile.customer_id)
    .order('last_synced_at', { ascending: false })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Fuel Cards</h2>
        <p className="mt-1 text-sm text-muted-foreground">View and control WEX fuel cards assigned to your company.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Your fuel cards</CardTitle><CardDescription>{cards?.length ?? 0} cards are tied to this company.</CardDescription></CardHeader>
        <CardContent className="px-0">
          {error ? <p className="p-8 text-center text-destructive">Fuel cards could not be loaded.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead className="pl-6">Card</TableHead><TableHead>Driver</TableHead><TableHead>Unit</TableHead><TableHead>Status</TableHead><TableHead>Daily limit</TableHead><TableHead>Monthly limit</TableHead><TableHead className="pr-6">Last synchronized</TableHead></TableRow></TableHeader>
              <TableBody>
                {(cards ?? []).map((card) => <TableRow key={card.id}>
                  <TableCell className="pl-6"><Link href={`/portal/fuel-cards/${card.id}`} className="font-mono font-semibold hover:underline">•••• {card.card_last4 ?? '—'}</Link></TableCell>
                  <TableCell><p>{card.driver_name ?? 'Unassigned'}</p><p className="font-mono text-xs text-muted-foreground">{card.external_driver_id ?? ''}</p></TableCell>
                  <TableCell>{card.unit_number ?? '—'}</TableCell>
                  <TableCell><StatusBadge status={card.status} /></TableCell>
                  <TableCell>{formatOptionalCurrency(card.daily_limit)}</TableCell>
                  <TableCell>{formatOptionalCurrency(card.monthly_limit)}</TableCell>
                  <TableCell className="pr-6 text-muted-foreground"><LocalDateTime value={card.last_synced_at} /></TableCell>
                </TableRow>)}
                {!cards?.length && <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No WEX fuel cards are assigned to your company yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={status.toUpperCase() === 'ACTIVE' ? 'default' : 'secondary'}>{status.replaceAll('_', ' ')}</Badge>
}

function formatOptionalCurrency(value: number | string | null) {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value))
}

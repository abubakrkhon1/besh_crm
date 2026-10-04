import Link from 'next/link'
import { CreditCard, DollarSign, Snowflake, Truck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LocalDateTime } from '@/components/ui/local-date-time'
import { createClient, requireCustomerPortalProfile } from '@/lib/supabase/server'

export default async function PortalDashboardPage() {
  const { profile } = await requireCustomerPortalProfile()
  if (!profile?.customer_id) return null
  const db = await createClient()
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)

  const [customerResult, driversResult, cardsResult, transactionsResult] = await Promise.all([
    db.from('customer_portal_customer').select('company_name,contact_name,current_balance,credit_limit').eq('id', profile.customer_id).single(),
    db.from('customer_portal_drivers').select('id,status,onboarding_status', { count: 'exact' }).eq('customer_id', profile.customer_id),
    db.from('customer_portal_fuel_cards').select('id,card_last4,status,driver_name,unit_number,last_synced_at', { count: 'exact' }).eq('customer_id', profile.customer_id).order('last_synced_at', { ascending: false }),
    db.from('customer_portal_fuel_transactions').select('id,transaction_date,merchant_name,amount,status,card_last4').eq('customer_id', profile.customer_id).gte('transaction_date', monthStart.toISOString()).order('transaction_date', { ascending: false }).limit(8),
  ])

  const customer = customerResult.data
  const drivers = driversResult.data ?? []
  const cards = cardsResult.data ?? []
  const transactions = transactionsResult.data ?? []
  const activeCards = cards.filter((card) => card.status.toUpperCase() === 'ACTIVE').length
  const frozenCards = cards.filter((card) => card.status.toUpperCase() === 'INACTIVE').length
  const monthSpend = transactions.reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Welcome to {customer?.company_name ?? customer?.contact_name ?? 'your fleet'}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Manage your drivers and fuel cards. Every record shown here is scoped to your company.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Drivers" value={driversResult.count ?? drivers.length} description={`${drivers.filter((driver) => driver.onboarding_status === 'active').length} with mobile access`} icon={<Truck />} />
        <MetricCard title="Active cards" value={activeCards} description={`${cardsResult.count ?? cards.length} total cards`} icon={<CreditCard />} />
        <MetricCard title="Frozen cards" value={frozenCards} description="Provider status inactive" icon={<Snowflake />} />
        <MetricCard title="Recent spend" value={formatCurrency(monthSpend)} description="From the latest transactions" icon={<DollarSign />} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recently updated cards</CardTitle>
            <CardDescription>Latest fuel-card state synchronized from WEX.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader><TableRow><TableHead className="pl-6">Card</TableHead><TableHead>Driver</TableHead><TableHead>Status</TableHead><TableHead className="pr-6">Updated</TableHead></TableRow></TableHeader>
              <TableBody>
                {cards.slice(0, 6).map((card) => <TableRow key={card.id}>
                  <TableCell className="pl-6"><Link className="font-mono font-semibold hover:underline" href={`/portal/fuel-cards/${card.id}`}>•••• {card.card_last4 ?? '—'}</Link></TableCell>
                  <TableCell>{card.driver_name ?? card.unit_number ?? 'Unassigned'}</TableCell>
                  <TableCell><StatusBadge status={card.status} /></TableCell>
                  <TableCell className="pr-6 text-muted-foreground"><LocalDateTime value={card.last_synced_at} variant="compact" /></TableCell>
                </TableRow>)}
                {!cards.length && <TableRow><TableCell colSpan={4} className="h-28 text-center text-muted-foreground">No fuel cards are tied to this company yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent transactions</CardTitle>
            <CardDescription>Most recent activity available for your company.</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader><TableRow><TableHead className="pl-6">Date</TableHead><TableHead>Merchant</TableHead><TableHead>Status</TableHead><TableHead className="pr-6 text-right">Amount</TableHead></TableRow></TableHeader>
              <TableBody>
                {transactions.map((transaction) => <TableRow key={transaction.id}>
                  <TableCell className="pl-6 text-muted-foreground"><LocalDateTime value={transaction.transaction_date} variant="compact" /></TableCell>
                  <TableCell>{transaction.merchant_name ?? 'Fuel purchase'}</TableCell>
                  <TableCell><StatusBadge status={transaction.status} /></TableCell>
                  <TableCell className="pr-6 text-right font-medium">{formatCurrency(Number(transaction.amount ?? 0))}</TableCell>
                </TableRow>)}
                {!transactions.length && <TableRow><TableCell colSpan={4} className="h-28 text-center text-muted-foreground">No recent transactions.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function MetricCard({ title, value, description, icon }: { title: string; value: string | number; description: string; icon: React.ReactNode }) {
  return <Card><CardHeader className="flex-row items-start justify-between"><div><CardDescription>{title}</CardDescription><CardTitle className="mt-2 text-2xl">{value}</CardTitle></div><span className="text-primary">{icon}</span></CardHeader><CardContent className="text-xs text-muted-foreground">{description}</CardContent></Card>
}

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={['active', 'posted'].includes(status.toLowerCase()) ? 'default' : 'secondary'}>{status.replaceAll('_', ' ')}</Badge>
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

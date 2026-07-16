import Link from 'next/link'
import { Activity, AlertTriangle, CreditCard, DollarSign, Users } from 'lucide-react'
import { MetricCard } from '@/components/crm/ui/MetricCard'
import { ActivityTimeline } from '@/components/crm/ui/ActivityTimeline'
import { StatusBadge } from '@/components/crm/ui/StatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { currency, getDashboardOverview } from '@/lib/mock-data'

export default function DashboardPage() {
  const overview = getDashboardOverview()

  return (
    <div className="animate-fade-in pb-12">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Operations Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live fleet credit, card, transaction, and risk activity across Fuel CRM.
          </p>
        </div>
        <Link href="/crm/customers" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          View customers
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Total Customers" value={overview.totalCustomers} icon={<Users className="size-5" />} />
        <MetricCard title="Active Customers" value={overview.activeCustomers} icon={<Users className="size-5" />} />
        <MetricCard title="Pending Customers" value={overview.pendingCustomers} icon={<Activity className="size-5" />} />
        <MetricCard title="Suspended Customers" value={overview.suspendedCustomers} icon={<AlertTriangle className="size-5" />} />
        <MetricCard title="Active Fuel Cards" value={overview.activeFuelCards} icon={<CreditCard className="size-5" />} />
        <MetricCard title="Frozen Fuel Cards" value={overview.frozenFuelCards} icon={<CreditCard className="size-5" />} />
        <MetricCard title="Monthly Spend" value={currency(overview.monthlySpend)} icon={<DollarSign className="size-5" />} />
        <MetricCard title="Outstanding Balance" value={currency(overview.outstandingBalance)} icon={<DollarSign className="size-5" />} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card className="rounded-lg py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>Recent Fuel Transactions</CardTitle>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {overview.recentTransactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div>
                    <p className="font-medium">{transaction.merchant}</p>
                    <p className="text-sm text-muted-foreground">
                      {transaction.customer?.company} · {transaction.driver?.name ?? 'Unassigned'} · •••• {transaction.fuelCard?.last4}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{currency(transaction.amount)}</p>
                    <StatusBadge status={transaction.status === 'approved' ? 'success' : transaction.status === 'declined' ? 'danger' : 'pending'} label={transaction.status} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-lg py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>Cards Needing Attention</CardTitle>
            </CardHeader>
            <CardContent className="divide-y p-0">
              {overview.cardsNeedingAttention.map((card) => (
                <Link
                  href={`/crm/fuel-cards/${card.id}`}
                  key={card.id}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/35"
                >
                  <div>
                    <p className="font-mono font-medium">•••• {card.last4}</p>
                    <p className="text-sm text-muted-foreground">{card.customer?.company} · {card.driver?.name ?? 'Unassigned'}</p>
                  </div>
                  <StatusBadge status={card.status === 'active' ? 'success' : card.status === 'frozen' ? 'danger' : 'pending'} label={card.status} />
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityTimeline events={overview.recentActivity.map((log) => ({
              id: log.id,
              title: log.title,
              description: log.description,
              date: new Date(log.createdAt).toLocaleDateString(),
              icon: <Activity className="size-4" />,
            }))} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

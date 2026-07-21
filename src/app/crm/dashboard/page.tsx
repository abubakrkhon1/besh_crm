import Link from 'next/link'
import { ArrowRight, Contact, CreditCard, Droplets, ListFilter, Plus, UserMinus, UserPlus, Users } from 'lucide-react'
import { getGeneralManagerDashboard, getLeads, getSalesManagerDashboard, getSalesRepresentatives } from '@/app/actions/leads'
import { LeadsTable } from '@/components/crm/LeadsTable'
import { NewLeadDialog } from '@/components/crm/NewLeadDialog'
import { buildRepresentativePerformance, SalesRepresentativesTable } from '@/components/crm/SalesRepresentativesTable'
import { MetricCard } from '@/components/crm/ui/MetricCard'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getCurrentProfile } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const profile = await getCurrentProfile()

  if (profile?.role === 'sales_manager') return <SalesManagerDashboard name={profile.full_name} />
  if (profile?.role === 'sales_representative') return <SalesRepresentativeDashboard name={profile.full_name} />
  return <GeneralManagerDashboard name={profile?.full_name} />
}

async function GeneralManagerDashboard({ name }: { name?: string | null }) {
  const stats = await getGeneralManagerDashboard()
  const leads = await getLeads()

  return (
    <DashboardShell title={`Welcome${name ? `, ${name.split(' ')[0]}` : ''}`} description="A live overview of Fuel CRM performance and sales activity.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="Active cards" value={stats?.active_cards ?? 0} icon={<CreditCard />} />
        <MetricCard title="Gallons sold" value={Number(stats?.gallons_sold ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} icon={<Droplets />} />
        <MetricCard title="Customers joined" value={stats?.customers_joined ?? 0} icon={<UserPlus />} />
        <MetricCard title="Customers left" value={stats?.customers_left ?? 0} icon={<UserMinus />} />
        <MetricCard title="New leads" value={stats?.total_leads ?? 0} icon={<Contact />} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent leads</CardTitle>
          <CardDescription>The latest sales opportunities across all representatives.</CardDescription>
        </CardHeader>
        <CardContent><LeadsTable leads={leads.slice(0, 5)} showRepresentative /></CardContent>
      </Card>
    </DashboardShell>
  )
}

async function SalesManagerDashboard({ name }: { name?: string | null }) {
  const stats = await getSalesManagerDashboard()
  const [leads, representatives] = await Promise.all([getLeads(), getSalesRepresentatives()])
  const performance = buildRepresentativePerformance(representatives, leads)

  return (
    <DashboardShell title={`Sales team${name ? ` · ${name}` : ''}`} description="Monitor sales activity and lead conversion across the database.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="Representatives" value={stats?.total_representatives ?? 0} icon={<Users />} />
        <MetricCard title="Total leads" value={stats?.total_leads ?? 0} icon={<Contact />} />
        <MetricCard title="Accepted" value={stats?.accepted_leads ?? 0} icon={<Contact />} />
        <MetricCard title="Inserted in CRM" value={stats?.inserted_leads ?? 0} icon={<Contact />} />
        <MetricCard title="Conversion" value={`${stats?.conversion_rate ?? 0}%`} icon={<Contact />} />
      </div>
      <QuickActions leadLabel="New lead" leadsLabel="View all leads" />
      <div>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Representative performance</h2>
          <Link href="/crm/sales-representatives" className={buttonVariants({ variant: 'outline', size: 'sm' })}>View team</Link>
        </div>
        <SalesRepresentativesTable performance={performance.slice(0, 5)} />
      </div>
      <div>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Latest leads</h2>
          <Link href="/crm/leads" className={buttonVariants({ variant: 'outline', size: 'sm' })}>View all</Link>
        </div>
        <LeadsTable leads={leads.slice(0, 8)} showRepresentative />
      </div>
    </DashboardShell>
  )
}

async function SalesRepresentativeDashboard({ name }: { name?: string | null }) {
  const leads = await getLeads()
  const accepted = leads.filter((lead) => ['accepted', 'inserted_into_crm'].includes(lead.status)).length
  const inserted = leads.filter((lead) => lead.status === 'inserted_into_crm').length

  return (
    <DashboardShell title={`My sales workspace${name ? ` · ${name}` : ''}`} description="Add prospects and track their progress into Fuel CRM.">
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard title="My leads" value={leads.length} icon={<Contact />} />
        <MetricCard title="Accepted" value={accepted} icon={<Contact />} />
        <MetricCard title="Inserted in CRM" value={inserted} icon={<Contact />} />
      </div>
      <QuickActions leadLabel="Add lead" leadsLabel="View my leads" />
      <div>
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Recent leads</h2>
          <NewLeadDialog label="Add lead" />
        </div>
        <LeadsTable leads={leads.slice(0, 8)} showRepresentative={false} />
      </div>
    </DashboardShell>
  )
}

function QuickActions({ leadLabel, leadsLabel }: { leadLabel: string; leadsLabel: string }) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="quick-actions-title">
      <div>
        <h2 id="quick-actions-title" className="text-lg font-semibold">Quick actions</h2>
        <p className="text-sm text-muted-foreground">Jump straight into your most common sales tasks.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-gradient-to-br from-card to-primary/5 transition-shadow hover:shadow-md">
          <CardHeader>
            <CardTitle>Create a new lead</CardTitle>
            <CardDescription>Add a prospect and start tracking the opportunity.</CardDescription>
            <CardAction className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Plus aria-hidden="true" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <NewLeadDialog label={leadLabel} size="default" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-card to-muted/45 transition-shadow hover:shadow-md">
          <CardHeader>
            <CardTitle>Open lead pipeline</CardTitle>
            <CardDescription>Review lead status, contacts, and recent activity.</CardDescription>
            <CardAction className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              <ListFilter aria-hidden="true" />
            </CardAction>
          </CardHeader>
          <CardContent>
            <Link href="/crm/leads" className={buttonVariants({ variant: 'outline' })}>
              {leadsLabel}
              <ArrowRight data-icon="inline-end" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

function DashboardShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex animate-fade-in flex-col gap-6 pb-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  )
}

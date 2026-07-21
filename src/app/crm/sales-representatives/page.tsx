import { redirect } from 'next/navigation'
import { Contact, UserCheck, Users } from 'lucide-react'
import { getLeads, getSalesRepresentatives } from '@/app/actions/leads'
import { buildRepresentativePerformance, SalesRepresentativesTable } from '@/components/crm/SalesRepresentativesTable'
import { MetricCard } from '@/components/crm/ui/MetricCard'
import { getCurrentProfile } from '@/lib/supabase/server'

export default async function SalesRepresentativesPage() {
  const profile = await getCurrentProfile()
  if (profile?.role !== 'sales_manager') redirect('/crm/dashboard')

  const [representatives, leads] = await Promise.all([
    getSalesRepresentatives(),
    getLeads(),
  ])
  const performance = buildRepresentativePerformance(representatives, leads)
  const activeRepresentatives = performance.filter((row) => row.total > 0).length
  const insertedLeads = performance.reduce((total, row) => total + row.inserted, 0)

  return (
    <div className="flex animate-fade-in flex-col gap-6 pb-12">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sales Representatives</h1>
        <p className="mt-1 text-sm text-muted-foreground">Compare lead activity and CRM conversion for all sales representatives in the database.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard title="Representatives" value={representatives.length} icon={<Users />} />
        <MetricCard title="With lead activity" value={activeRepresentatives} icon={<UserCheck />} />
        <MetricCard title="Leads inserted in CRM" value={insertedLeads} icon={<Contact />} />
      </div>

      <SalesRepresentativesTable performance={performance} />
    </div>
  )
}

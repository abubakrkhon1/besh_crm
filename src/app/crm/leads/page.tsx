import { getLeads, getSalesRepresentatives } from '@/app/actions/leads'
import { LeadsTable } from '@/components/crm/LeadsTable'
import { getCurrentProfile } from '@/lib/supabase/server'

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ rep?: string; new?: string }> }) {
  const profile = await getCurrentProfile()
  const { rep, new: newLead } = await searchParams
  const canFilterRepresentatives = profile?.role !== 'sales_representative'
  const representatives = canFilterRepresentatives ? await getSalesRepresentatives() : []
  const validRepresentativeId = representatives.some((representative) => representative.id === rep) ? rep : undefined
  const selectedRepresentative = canFilterRepresentatives ? validRepresentativeId : profile?.id
  const leads = await getLeads(selectedRepresentative)

  return (
    <div className="animate-fade-in pb-12">
      <LeadsTable
        leads={leads}
        showRepresentative={canFilterRepresentatives}
        representatives={representatives}
        selectedRepresentativeId={validRepresentativeId}
        canAddLead={profile?.role === 'sales_manager' || profile?.role === 'sales_representative'}
        showFilters
        openNewLead={newLead === '1'}
      />
    </div>
  )
}

import { redirect } from 'next/navigation'
import { listStationSavingsPrices } from '@/app/actions/savings-pricing'
import { SavingsPricingWorkspace } from '@/components/crm/SavingsPricingWorkspace'
import { getCurrentProfile } from '@/lib/supabase/server'

export default async function SavingsPricingPage() {
  const profile = await getCurrentProfile()

  if (!profile || !['owner', 'general_manager'].includes(profile.role)) {
    redirect('/access-denied')
  }

  const pricing = await listStationSavingsPrices()

  return <SavingsPricingWorkspace initialPrices={pricing.prices} loadError={pricing.error} />
}

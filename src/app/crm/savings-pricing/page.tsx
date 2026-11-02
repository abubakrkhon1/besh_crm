import { redirect } from 'next/navigation'
import { getProviderPricingDashboard } from '@/app/actions/provider-pricing'
import { ProviderPricingWorkspace } from '@/components/crm/ProviderPricingWorkspace'
import { getCurrentProfile } from '@/lib/supabase/server'

export default async function SavingsPricingPage() {
  const profile = await getCurrentProfile()

  if (!profile || !['owner', 'admin', 'general_manager'].includes(profile.role)) {
    redirect('/access-denied')
  }

  const providerPricing = await getProviderPricingDashboard()
  return <ProviderPricingWorkspace {...providerPricing} />
}

import { redirect } from 'next/navigation'
import { PortalHeader } from '@/components/portal/PortalHeader'
import { PortalSidebar } from '@/components/portal/PortalSidebar'
import { createClient, requireCustomerPortalProfile } from '@/lib/supabase/server'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireCustomerPortalProfile()
  if (!profile?.customer_id) redirect('/access-denied')

  const db = await createClient()
  const { data: customer } = await db.from('customer_portal_customer')
    .select('company_name,contact_name,status')
    .eq('id', profile.customer_id)
    .maybeSingle()
  if (!customer || customer.status !== 'active') redirect('/access-denied')

  const companyName = customer.company_name ?? customer.contact_name ?? 'Company account'
  const userName = profile.full_name ?? profile.email ?? 'Company administrator'

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-60">
        <PortalSidebar companyName={companyName} userName={userName} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <PortalHeader companyName={companyName} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-7xl p-4 md:p-6">{children}</div>
        </main>
      </div>
    </div>
  )
}

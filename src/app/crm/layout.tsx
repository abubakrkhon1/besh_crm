import { Sidebar } from '@/components/crm/Sidebar'
import { Header } from '@/components/crm/Header'
import { CRM_ROLES, getCurrentProfile } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function CRMLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const profile = await getCurrentProfile()
  if (!profile || !CRM_ROLES.includes(profile.role as (typeof CRM_ROLES)[number])) {
    redirect('/access-denied')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground transition-colors">
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-30 lg:flex lg:w-[216px] lg:flex-col">
        <Sidebar profile={profile} />
      </div>

      <div className="flex flex-1 flex-col h-full min-w-0 lg:pl-[216px]">
        <Header profile={profile} />
        
        <main className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="h-full w-full min-w-0 p-4 md:p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

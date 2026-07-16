import { Sidebar } from '@/components/crm/Sidebar'
import { Header } from '@/components/crm/Header'

export default function CRMLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground transition-colors">
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-30 lg:flex lg:w-64 lg:flex-col">
        <Sidebar />
      </div>

      <div className="flex flex-col flex-1 lg:pl-64 h-full min-w-0">
        <Header />
        
        <main className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="h-full w-full min-w-0 px-4 py-4 md:px-6 md:py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

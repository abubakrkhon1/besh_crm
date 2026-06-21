import { Sidebar } from '@/components/crm/Sidebar'
import { Header } from '@/components/crm/Header'

export default function CRMLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen bg-background overflow-hidden transition-colors">

      {/* Sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-30 lg:flex lg:w-64 lg:flex-col">
        <Sidebar />
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 lg:pl-64 h-full min-w-0">
        <Header />
        
        <main className="flex-1 overflow-y-auto overflow-x-hidden relative z-10">
          <div className="px-4 py-8 sm:px-6 lg:px-8 min-w-0 h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

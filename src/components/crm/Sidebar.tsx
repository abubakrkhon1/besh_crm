'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Fuel, LayoutDashboard, FileText, Settings, LogOut } from 'lucide-react'
import { logout } from '@/app/actions/auth'

const navigation = [
  { name: 'Dashboard', href: '/crm/dashboard', icon: LayoutDashboard },
  { name: 'Applications', href: '/crm/applications', icon: FileText },
  { name: 'Settings', href: '#', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="flex h-full flex-col w-64 glass-panel border-r border-border bg-surface">
      <div className="flex h-16 shrink-0 items-center px-6 border-b border-border">
        <Fuel className="h-8 w-8 text-primary" />
        <span className="ml-3 font-sans font-bold text-lg tracking-wide text-foreground">
          Fuel CRM
        </span>
      </div>
      
      <div className="flex flex-1 flex-col overflow-y-auto px-4 py-6">
        <nav className="flex-1 space-y-2">
          {navigation.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/crm/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`group flex items-center rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-primary-dim text-primary font-semibold'
                    : 'text-muted-foreground hover:bg-surface-raised hover:text-foreground'
                }`}
              >
                <item.icon
                  className={`mr-3 h-5 w-5 shrink-0 transition-colors ${
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                  }`}
                  aria-hidden="true"
                />
                {item.name}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="mt-auto px-4 py-6 border-t border-border">
        <form action={logout}>
          <button
            type="submit"
            className="group flex w-full items-center rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-all cursor-pointer"
          >
            <LogOut className="mr-3 h-5 w-5 shrink-0 text-muted-foreground group-hover:text-red-500 transition-colors" />
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}

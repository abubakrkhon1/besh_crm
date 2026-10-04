'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CreditCard, Gauge, LogOut, Truck } from 'lucide-react'
import { logout } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Overview', href: '/portal/dashboard', icon: Gauge },
  { name: 'Drivers', href: '/portal/drivers', icon: Truck },
  { name: 'Fuel Cards', href: '/portal/fuel-cards', icon: CreditCard },
]

export function PortalSidebar({ companyName, userName }: { companyName: string; userName: string }) {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground">
          <CreditCard aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{companyName}</p>
          <p className="text-xs text-sidebar-foreground">BESH customer portal</p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-2">
        {navigation.map((item) => {
          const active = pathname === item.href || (item.href !== '/portal/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                active ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'hover:bg-sidebar-accent hover:text-white',
              )}
            >
              <item.icon aria-hidden="true" />
              {item.name}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <p className="mb-3 truncate px-2 text-xs text-sidebar-foreground">Signed in as {userName}</p>
        <form action={logout}>
          <Button type="submit" variant="ghost" className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-white">
            <LogOut data-icon="inline-start" />
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  )
}

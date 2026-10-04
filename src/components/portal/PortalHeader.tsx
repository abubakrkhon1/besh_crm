'use client'

import { usePathname } from 'next/navigation'
import { CreditCard, Gauge, Truck } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const mobileNavigation = [
  { name: 'Overview', href: '/portal/dashboard', icon: Gauge },
  { name: 'Drivers', href: '/portal/drivers', icon: Truck },
  { name: 'Cards', href: '/portal/fuel-cards', icon: CreditCard },
]

export function PortalHeader({ companyName }: { companyName: string }) {
  const pathname = usePathname()
  const title = pathname.startsWith('/portal/drivers') ? 'Drivers'
    : pathname.startsWith('/portal/fuel-cards') ? 'Fuel Cards'
      : 'Overview'

  return (
    <header className="sticky top-0 z-20 border-b bg-card">
      <div className="flex h-14 items-center justify-between px-4 md:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{title}</h1>
          <p className="truncate text-xs text-muted-foreground lg:hidden">{companyName}</p>
        </div>
      </div>
      <nav className="grid grid-cols-3 border-t lg:hidden">
        {mobileNavigation.map((item) => {
          const active = pathname === item.href || (item.href !== '/portal/dashboard' && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href} className={cn('flex items-center justify-center gap-2 py-2 text-xs font-medium', active ? 'text-primary' : 'text-muted-foreground')}>
              <item.icon aria-hidden="true" />
              {item.name}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}

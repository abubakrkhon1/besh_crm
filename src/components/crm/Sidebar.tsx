'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, Settings, LogOut, Users, CreditCard, BarChart, ReceiptText, Contact, type LucideIcon } from 'lucide-react'
import { logout } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Profile } from '@/types/database.types'

type NavigationItem = { name: string; href: string; icon: LucideIcon; disabled?: boolean }

const operationsNavigation: NavigationItem[] = [
  { name: 'Dashboard', href: '/crm/dashboard', icon: LayoutDashboard },
  { name: 'Applications', href: '/crm/applications', icon: FileText },
  { name: 'Customers', href: '/crm/customers', icon: Users },
  { name: 'Fuel Cards', href: '/crm/fuel-cards', icon: CreditCard },
  { name: 'Transactions', href: '/crm/transactions', icon: ReceiptText },
  { name: 'Reports', href: '#', icon: BarChart, disabled: true },
  { name: 'Settings', href: '#', icon: Settings },
]

const salesManagerNavigation: NavigationItem[] = [
  { name: 'Dashboard', href: '/crm/dashboard', icon: LayoutDashboard },
  { name: 'Sales Representatives', href: '/crm/sales-representatives', icon: Users },
  { name: 'Leads', href: '/crm/leads', icon: Contact },
]

const salesRepresentativeNavigation: NavigationItem[] = [
  { name: 'Dashboard', href: '/crm/dashboard', icon: LayoutDashboard },
  { name: 'My Leads', href: '/crm/leads', icon: Contact },
]

export function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const navigation = profile.role === 'sales_manager'
    ? salesManagerNavigation
    : profile.role === 'sales_representative'
      ? salesRepresentativeNavigation
      : [...operationsNavigation.slice(0, 1), { name: 'Leads', href: '/crm/leads', icon: Contact }, ...operationsNavigation.slice(1)]

  return (
    <aside className="flex h-full w-[216px] flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-5 pb-[18px] pt-[22px]">
        <div className="min-w-0">
          <span className="block truncate text-xl font-bold leading-tight text-white">BESH CRM</span>
          <span className="block text-md leading-tight text-sidebar-foreground">Operations workspace</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-2.5 pt-1.5">
        <nav className="flex flex-1 flex-col gap-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/crm/dashboard' && item.href !== '#' && pathname.startsWith(item.href))
            return item.disabled ? (
              <Tooltip key={item.name}>
                <TooltipTrigger
                  className="flex w-full cursor-not-allowed items-center rounded-md px-3 py-2 text-[13.5px] font-medium text-sidebar-foreground/45"
                >
                  <item.icon className="mr-3 size-4 shrink-0 opacity-60" aria-hidden="true" />
                  {item.name}
                </TooltipTrigger>
                <TooltipContent side="right">Coming soon</TooltipContent>
              </Tooltip>
            ) : (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'group flex items-center gap-2.5 rounded-md px-3 py-2 text-[13.5px] font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-white'
                )}
              >
                <item.icon
                  className={cn(
                    'size-4 shrink-0 transition-colors',
                    isActive ? 'text-white' : 'text-sidebar-foreground group-hover:text-white'
                  )}
                  aria-hidden="true"
                />
                {item.name}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="mt-auto border-t border-sidebar-border px-5 py-4">
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-xs font-bold text-white">
            {(profile.full_name ?? profile.email ?? 'CRM').split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-semibold text-white">{profile.full_name ?? profile.email ?? 'CRM user'}</p>
            <p className="text-[11px] capitalize text-sidebar-foreground">{profile.role.replaceAll('_', ' ')}</p>
          </div>
        </div>
        <form action={logout}>
          <Button
            type="submit"
            variant="ghost"
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
          >
            <LogOut className="mr-3 size-4 shrink-0" />
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  )
}

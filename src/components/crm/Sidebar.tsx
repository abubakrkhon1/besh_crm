'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, Settings, LogOut, Users, CreditCard, BarChart, ReceiptText, Contact, Flame, Tags, type LucideIcon } from 'lucide-react'
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
  { name: 'Leads', href: '/crm/leads', icon: Contact },
  { name: 'Applications', href: '/crm/applications', icon: FileText },
  { name: 'Sales Agents', href: '/crm/sales-agents', icon: Users },
]

const salesRepresentativeNavigation: NavigationItem[] = [
  { name: 'Dashboard', href: '/crm/dashboard', icon: LayoutDashboard },
  { name: 'My Leads', href: '/crm/leads', icon: Contact },
]

export function Sidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const baseNavigation = profile.role === 'sales_manager'
    ? salesManagerNavigation
    : profile.role === 'sales_agent'
      ? salesRepresentativeNavigation
      : [...operationsNavigation.slice(0, 1), { name: 'Leads', href: '/crm/leads', icon: Contact }, ...operationsNavigation.slice(1)]
  const navigation = ['owner', 'general_manager'].includes(profile.role)
    ? [
        ...baseNavigation.slice(0, 5),
        { name: 'Savings Pricing', href: '/crm/savings-pricing', icon: Tags },
        ...baseNavigation.slice(5),
      ]
    : baseNavigation

  return (
    <aside className="flex h-full w-[202px] flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-[18px] pb-[19px] pt-[21px]">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sidebar-primary to-chart-2 text-white shadow-md shadow-sidebar-primary/20 [&_svg]:size-5">
          <Flame aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <span className="block truncate text-[18px] font-bold leading-tight text-white">BESH CRM</span>
          <span className="block text-xs leading-tight text-sidebar-foreground">Fuel Operations</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto px-2 pt-1.5">
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
                  'group flex items-center gap-2.5 rounded-md px-3 py-[9px] text-[13px] font-medium transition-colors',
                  isActive
                    ? 'bg-sidebar-primary font-semibold text-sidebar-primary-foreground shadow-sm shadow-sidebar-primary/20'
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

      <div className="mt-auto border-t border-sidebar-border px-[18px] py-4">
        <div className="mb-3 flex items-center gap-2.5">
          <div className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sidebar-primary to-chart-3 text-xs font-bold text-white shadow-sm">
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

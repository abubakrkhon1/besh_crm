'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, Settings, LogOut, Users, CreditCard, BarChart, ReceiptText } from 'lucide-react'
import { logout } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const navigation = [
  { name: 'Dashboard', href: '/crm/dashboard', icon: LayoutDashboard },
  { name: 'Applications', href: '/crm/applications', icon: FileText },
  { name: 'Customers', href: '/crm/customers', icon: Users },
  { name: 'Fuel Cards', href: '/crm/fuel-cards', icon: CreditCard },
  { name: 'Transactions', href: '/crm/transactions', icon: ReceiptText },
  { name: 'Reports', href: '#', icon: BarChart, disabled: true },
  { name: 'Settings', href: '#', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-sidebar">
      <div className="flex flex-col py-8 px-4">
        <span className="block text-xl font-semibold text-amber-600 dark:text-amber-300">
          BESH LLC
        </span>
        <span className="block text-sm font-semibold text-sidebar-foreground">Operations CRM</span>
      </div>

      <Separator />

      <div className="flex flex-1 flex-col overflow-y-auto px-3">
        <nav className="flex-1 space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/crm/dashboard' && item.href !== '#' && pathname.startsWith(item.href))
            return item.disabled ? (
              <Tooltip key={item.name}>
                <TooltipTrigger
                  className="flex w-full cursor-not-allowed items-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground/45"
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
                  'group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                <item.icon
                  className={cn(
                    'mr-3 size-4 shrink-0 transition-colors',
                    isActive ? 'text-amber-600 dark:text-amber-300' : 'text-muted-foreground group-hover:text-foreground'
                  )}
                  aria-hidden="true"
                />
                {item.name}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="mt-auto border-t p-3">
        <form action={logout}>
          <Button
            type="submit"
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300"
          >
            <LogOut className="mr-3 size-4 shrink-0" />
            Sign out
          </Button>
        </form>
      </div>
    </aside>
  )
}

'use client'

import { Bell, Search, Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Profile } from '@/types/database.types'

export function Header({ profile }: { profile: Profile }) {
  const { theme, setTheme } = useTheme()
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)
  const initials = (profile.full_name ?? profile.email ?? 'FC')
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
  const title = pathname.startsWith('/crm/sales-representatives') ? 'Sales Representatives'
    : pathname.startsWith('/crm/applications') ? 'Applications'
      : pathname.startsWith('/crm/customers') ? 'Customers'
        : pathname.startsWith('/crm/fuel-cards') ? 'Fuel Cards'
          : pathname.startsWith('/crm/transactions') ? 'Transactions'
            : pathname.startsWith('/crm/leads/new') ? 'Add Lead'
              : pathname.startsWith('/crm/leads') ? 'Leads'
                : 'Dashboard'

  // Avoid hydration mismatch
  useEffect(() => {
    // Client-only theme state prevents hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  return (
    <header className="sticky top-0 z-20 flex h-[60px] shrink-0 items-center border-b bg-card px-4 md:px-6">
      <div className="flex w-full items-center justify-between gap-4">
        <h1 className="truncate text-[17px] font-bold text-foreground">{title}</h1>
        <div className="flex items-center gap-3.5">
        <div className="relative hidden w-60 items-center md:flex">
          <label htmlFor="search-field" className="sr-only">
            Search
          </label>
          <Search
            className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="search-field"
            className="h-8 w-full rounded-md border bg-background pl-9 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-100"
            placeholder="Search leads, accounts…"
            type="search"
            name="search"
            disabled
            title="Global search coming soon"
          />
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <button type="button" className={buttonVariants({ variant: 'ghost', size: 'icon' })} aria-label="View notifications" />
              }
            >
              <Bell className="size-4" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>Notifications</TooltipContent>
          </Tooltip>

          {mounted && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className={buttonVariants({ variant: 'ghost', size: 'icon' })}
                    aria-label="Toggle theme"
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  />
                }
              >
                {theme === 'dark' ? (
                  <Sun className="size-4" aria-hidden="true" />
                ) : (
                  <Moon className="size-4" aria-hidden="true" />
                )}
              </TooltipTrigger>
              <TooltipContent>Toggle theme</TooltipContent>
            </Tooltip>
          )}

          <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
        </div>
      </div>
    </header>
  )
}

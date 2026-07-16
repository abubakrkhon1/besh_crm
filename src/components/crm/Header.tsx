'use client'

import { Bell, Search, Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function Header() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch
  useEffect(() => {
    // Client-only theme state prevents hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center border-b bg-background/85 px-4 backdrop-blur-xl md:px-6">
      <div className="flex w-full items-center gap-4">
        <div className="relative flex min-w-0 flex-1 items-center">
          <label htmlFor="search-field" className="sr-only">
            Search
          </label>
          <Search
            className="pointer-events-none absolute left-3 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="search-field"
            className="h-9 w-full rounded-lg border bg-card pl-9 pr-16 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-amber-500/40 focus:ring-3 focus:ring-amber-500/10 disabled:cursor-not-allowed disabled:opacity-80"
            placeholder="Search applications, customers, cards..."
            type="search"
            name="search"
            disabled
            title="Global search coming soon"
          />
          <div className="pointer-events-none absolute right-2 hidden items-center sm:flex">
            <kbd className="inline-flex h-5 items-center gap-1 rounded border bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">
              <span>⌘</span>K
            </kbd>
          </div>
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

          <Separator orientation="vertical" className="mx-2 hidden h-5 sm:block" />
          <Avatar>
            <AvatarFallback className="bg-amber-500/10 text-xs font-semibold text-amber-700 dark:text-amber-300">
              FC
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  )
}

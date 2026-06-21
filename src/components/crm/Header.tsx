'use client'

import { Bell, Search, User, Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export function Header() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-x-4 border-b border-border bg-surface backdrop-blur-md px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8 transition-colors">
      <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
        <div className="relative flex flex-1 items-center">
          <label htmlFor="search-field" className="sr-only">
            Search
          </label>
          <Search
            className="pointer-events-none absolute left-0 h-5 w-5 text-accent"
            aria-hidden="true"
          />
          <input
            id="search-field"
            className="block h-full w-full border-0 py-0 pl-8 pr-0 text-foreground placeholder:text-accent focus:ring-0 sm:text-sm bg-transparent outline-none"
            placeholder="Search..."
            type="search"
            name="search"
            disabled
            title="Global search coming soon"
          />
        </div>
        <div className="flex items-center gap-x-4 lg:gap-x-6">
          <button type="button" className="-m-2.5 p-2.5 text-accent hover:text-foreground cursor-pointer transition-colors">
            <span className="sr-only">View notifications</span>
            <Bell className="h-6 w-6" aria-hidden="true" />
          </button>

          {mounted && (
            <button
              type="button"
              className="-m-2.5 p-2.5 text-accent hover:text-foreground cursor-pointer transition-colors"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              <span className="sr-only">Toggle theme</span>
              {theme === 'dark' ? (
                <Sun className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Moon className="h-6 w-6" aria-hidden="true" />
              )}
            </button>
          )}

          {/* Separator */}
          <div className="hidden lg:block lg:h-6 lg:w-px lg:bg-border" aria-hidden="true" />

          {/* Profile dropdown */}
          <div className="flex items-center gap-x-4">
            <div className="h-8 w-8 rounded-full bg-surface-raised border border-border flex items-center justify-center">
              <User className="h-5 w-5 text-accent" />
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

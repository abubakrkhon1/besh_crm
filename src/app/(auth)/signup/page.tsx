'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Fuel, Loader2 } from 'lucide-react'
import { signup } from '@/app/actions/auth'

export default function SignupPage() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)
    
    startTransition(async () => {
      const result = await signup(formData)
      if (result?.error) {
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex min-h-screen flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden bg-background transition-colors">

      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10 relative">
        <div className="flex justify-center">
          <Fuel className="h-12 w-12 text-primary" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-bold tracking-tight text-foreground font-sans">
          Create an admin account
        </h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Or{' '}
          <Link href="/login" className="font-medium text-primary hover:text-primary-dim transition-colors">
            sign in to your existing account
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10 relative animate-slide-up">
        <div className="glass-panel border border-slate-800 py-8 px-4 shadow sm:rounded-xl sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-md bg-red-500/10 p-4 border border-red-500/20">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-400">{error}</h3>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-foreground">
                Email address
              </label>
              <div className="mt-2">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  className="input-field"
                  placeholder="admin@example.com"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-foreground">
                Password
              </label>
              <div className="mt-2">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  className="input-field"
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isPending}
                className="btn-primary w-full flex justify-center py-3"
              >
                {isPending ? <Loader2 className="animate-spin h-5 w-5" /> : 'Create Account'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

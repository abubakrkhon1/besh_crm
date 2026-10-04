'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { AlertCircle, CheckCircle2, Fuel, Loader2 } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import {
  getResetPasswordFieldErrors,
  resetPasswordSchema,
  type ResetPasswordFieldErrors,
} from '@/lib/validation/auth'

type RecoveryState = 'verifying' | 'ready' | 'invalid' | 'complete'
const supportedLinkTypes = new Set(['invite', 'recovery'])

export default function ResetPasswordPage() {
  const supabaseRef = useRef(createClient())
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('verifying')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<ResetPasswordFieldErrors>({})
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    const supabase = supabaseRef.current

    const markReady = () => {
      if (active) {
        setError(null)
        setRecoveryState('ready')
      }
    }

    const verifyRecoveryLink = async () => {
      const url = new URL(window.location.href)
      const linkError = url.searchParams.get('error_description')
      if (linkError) {
        if (active) {
          setError('This account setup or password reset link is invalid or has expired.')
          setRecoveryState('invalid')
        }
        return
      }

      const code = url.searchParams.get('code')
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (!exchangeError) {
          window.history.replaceState({}, '', url.pathname)
          markReady()
          return
        }
      }

      const tokenHash = url.searchParams.get('token_hash')
      const queryType = url.searchParams.get('type')
      if (tokenHash && queryType && supportedLinkTypes.has(queryType)) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: queryType as 'invite' | 'recovery',
        })
        if (!verifyError) {
          window.history.replaceState({}, '', url.pathname)
          markReady()
          return
        }
      }

      const hash = new URLSearchParams(url.hash.slice(1))
      const accessToken = hash.get('access_token')
      const refreshToken = hash.get('refresh_token')
      const hashType = hash.get('type')
      if (accessToken && refreshToken && hashType && supportedLinkTypes.has(hashType)) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (!sessionError) {
          window.history.replaceState({}, '', url.pathname)
          markReady()
          return
        }
      }

      if (active) {
        setError('This account setup or password reset link is invalid or has expired.')
        setRecoveryState('invalid')
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) markReady()
    })

    void verifyRecoveryLink()
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})

    const formData = new FormData(event.currentTarget)
    const parsed = resetPasswordSchema.safeParse({
      password: formData.get('password'),
      confirmPassword: formData.get('confirmPassword'),
    })

    if (!parsed.success) {
      setFieldErrors(getResetPasswordFieldErrors(parsed.error))
      return
    }

    startTransition(async () => {
      const supabase = supabaseRef.current
      const { error: updateError } = await supabase.auth.updateUser({
        password: parsed.data.password,
      })

      if (updateError) {
        setError(
          updateError.code === 'same_password'
            ? 'Choose a password different from your current password.'
            : 'We could not update your password. Request a new reset link and try again.'
        )
        return
      }

      await supabase.auth.signOut({ scope: 'local' })
      setRecoveryState('complete')
    })
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4 sm:p-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-foreground text-background shadow-md">
            <Fuel aria-hidden="true" />
          </div>
          <CardTitle className="text-2xl">
            {recoveryState === 'complete' ? 'Password updated' : 'Set a new password'}
          </CardTitle>
          <CardDescription>
            {recoveryState === 'complete'
              ? 'Your new password is ready to use in Besh Fuel.'
              : 'Choose a strong password for your BESH account.'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {recoveryState === 'verifying' && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 aria-hidden="true" className="animate-spin" />
              Verifying your account link…
            </div>
          )}

          {recoveryState === 'invalid' && (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>Account link unavailable</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {recoveryState === 'complete' && (
            <Alert>
              <CheckCircle2 aria-hidden="true" />
              <AlertTitle>Password changed successfully</AlertTitle>
              <AlertDescription>
                Return to the BESH sign-in page and use your new password.
              </AlertDescription>
            </Alert>
          )}

          {recoveryState === 'ready' && (
            <form onSubmit={handleSubmit} noValidate aria-describedby={error ? 'reset-error' : undefined}>
              <FieldGroup>
                <Field data-invalid={Boolean(fieldErrors.password)}>
                  <FieldLabel htmlFor="password">New password</FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    disabled={isPending}
                    maxLength={72}
                    aria-invalid={Boolean(fieldErrors.password)}
                    aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                  />
                  {fieldErrors.password && (
                    <FieldError id="password-error">{fieldErrors.password}</FieldError>
                  )}
                </Field>

                <Field data-invalid={Boolean(fieldErrors.confirmPassword)}>
                  <FieldLabel htmlFor="confirmPassword">Confirm new password</FieldLabel>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    disabled={isPending}
                    maxLength={72}
                    aria-invalid={Boolean(fieldErrors.confirmPassword)}
                    aria-describedby={fieldErrors.confirmPassword ? 'confirm-password-error' : undefined}
                  />
                  {fieldErrors.confirmPassword && (
                    <FieldError id="confirm-password-error">
                      {fieldErrors.confirmPassword}
                    </FieldError>
                  )}
                </Field>

                {error && <FieldError id="reset-error">{error}</FieldError>}

                <Button type="submit" size="lg" disabled={isPending}>
                  {isPending && <Loader2 data-icon="inline-start" className="animate-spin" />}
                  {isPending ? 'Updating password…' : 'Update password'}
                </Button>
              </FieldGroup>
            </form>
          )}
        </CardContent>

        {(recoveryState === 'invalid' || recoveryState === 'complete') && (
          <CardFooter>
            <Link href="/login" className="w-full text-center text-sm underline underline-offset-4">
              Return to sign in
            </Link>
          </CardFooter>
        )}
      </Card>
    </main>
  )
}

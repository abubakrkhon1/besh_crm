'use client'

import Image from 'next/image'
import { useState, useTransition } from 'react'
import { ArrowRight, Fuel, Loader2 } from 'lucide-react'

import { login } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  getLoginFieldErrors,
  loginSchema,
  type LoginFieldErrors,
} from '@/lib/validation/auth'

export default function LoginPage() {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({})

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    const formData = new FormData(event.currentTarget)
    const parsedCredentials = loginSchema.safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
    })

    if (!parsedCredentials.success) {
      setFieldErrors(getLoginFieldErrors(parsedCredentials.error))
      return
    }

    formData.set('email', parsedCredentials.data.email)
    formData.set('password', parsedCredentials.data.password)

    startTransition(async () => {
      const result = await login(formData)
      if (result.fieldErrors) setFieldErrors(result.fieldErrors)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4 sm:p-8">
      <Card className="grid w-full max-w-6xl gap-0 overflow-hidden rounded-2xl py-0 shadow-2xl lg:h-140 lg:grid-cols-2">
        <section className="relative hidden overflow-hidden lg:block" aria-label="Fuel CRM">
          <Image
            src="/images/login-fleet.png"
            alt="A fleet truck at a commercial fuel station"
            fill
            priority
            sizes="(min-width: 1024px) 576px, 0px"
            className="object-cover object-[center_72%]"
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/75 via-black/20 to-black/10" />

          <div className="absolute inset-0 flex flex-col justify-between p-6 text-white">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex size-8 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm">
                <Fuel aria-hidden="true" />
              </span>
              BESH CRM
            </div>

            <div className="max-w-md">
              <p className="font-heading text-3xl leading-tight font-semibold tracking-tight">
                Turn every prospect into forward momentum.
              </p>
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/80">
                Manage leads, fleet demand, and customer growth from one focused workspace.
              </p>
            </div>
          </div>
        </section>

        <section className="flex min-h-[600px] flex-col bg-card lg:min-h-0">
          <div className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-md">
              <CardHeader className="gap-3 px-8 pt-4 pb-3 text-center sm:px-10">
                <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-foreground text-background shadow-md">
                  <Fuel aria-hidden="true" />
                </div>
                <div className="flex flex-col gap-1">
                  <CardTitle className="text-2xl">Sign in to your account</CardTitle>
                  <CardDescription>
                    Welcome back! Sign in to continue to BESH CRM.
                  </CardDescription>
                </div>
              </CardHeader>

              <CardContent className="px-8 pb-4 sm:px-10">
                <form
                  onSubmit={handleSubmit}
                  noValidate
                  aria-describedby={error ? 'login-error' : undefined}
                >
                  <FieldGroup className="gap-4">
                    <Field data-invalid={Boolean(fieldErrors.email)}>
                      <FieldLabel htmlFor="email">Email address</FieldLabel>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        placeholder="Enter your email address"
                        required
                        disabled={isPending}
                        maxLength={254}
                        aria-invalid={Boolean(fieldErrors.email)}
                        aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                        className="h-9"
                      />
                      {fieldErrors.email && (
                        <FieldError id="email-error">{fieldErrors.email}</FieldError>
                      )}
                    </Field>

                    <Field data-invalid={Boolean(fieldErrors.password)}>
                      <FieldLabel htmlFor="password">Password</FieldLabel>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        placeholder="Enter your password"
                        required
                        disabled={isPending}
                        maxLength={1_024}
                        aria-invalid={Boolean(fieldErrors.password)}
                        aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                        className="h-9"
                      />
                      {fieldErrors.password && (
                        <FieldError id="password-error">{fieldErrors.password}</FieldError>
                      )}
                    </Field>

                    {error && <FieldError id="login-error">{error}</FieldError>}

                    <Button
                      type="submit"
                      size="lg"
                      className="h-9 w-full bg-foreground text-background hover:bg-foreground/90"
                      disabled={isPending}
                    >
                      {isPending && <Loader2 data-icon="inline-start" className="animate-spin" />}
                      {isPending ? 'Signing in…' : 'Continue'}
                      {!isPending && <ArrowRight data-icon="inline-end" />}
                    </Button>
                  </FieldGroup>
                </form>
              </CardContent>
            </div>
          </div>
        </section>
      </Card>
    </main>
  )
}

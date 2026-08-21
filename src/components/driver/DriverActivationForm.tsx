'use client'

import { useActionState } from 'react'
import { CheckCircle2, KeyRound } from 'lucide-react'
import { activateDriverAccount } from '@/app/actions/driver-invitations'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { DriverActivationState } from '@/lib/validation/drivers'

const initialState: DriverActivationState = {}

export function DriverActivationForm({ token, mobileAppUrl }: { token: string; mobileAppUrl?: string }) {
  const action = activateDriverAccount.bind(null, token)
  const [state, formAction, pending] = useActionState(action, initialState)

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Account activated</AlertTitle>
          <AlertDescription>Your driver account is ready. Sign in to BESH Mobile with the email that received the invitation.</AlertDescription>
        </Alert>
        {mobileAppUrl && <Button render={<a href={mobileAppUrl} />}>Open BESH Mobile</Button>}
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error && (
        <Alert variant="destructive">
          <KeyRound />
          <AlertTitle>Account could not be activated</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <Field data-invalid={Boolean(state.fieldErrors?.password)}>
          <FieldLabel htmlFor="password">Create password</FieldLabel>
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={128} required aria-invalid={Boolean(state.fieldErrors?.password)} />
          <FieldDescription>Use at least 12 characters. A memorable passphrase is recommended.</FieldDescription>
          <FieldError>{state.fieldErrors?.password}</FieldError>
        </Field>
        <Field data-invalid={Boolean(state.fieldErrors?.confirmPassword)}>
          <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
          <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required aria-invalid={Boolean(state.fieldErrors?.confirmPassword)} />
          <FieldError>{state.fieldErrors?.confirmPassword}</FieldError>
        </Field>
      </FieldGroup>
      <Button type="submit" disabled={pending}>{pending ? 'Activating…' : 'Activate account'}</Button>
    </form>
  )
}

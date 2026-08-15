'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createLead, CreateLeadState } from '@/app/actions/leads'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'

const initialState: CreateLeadState = {}

export function NewLeadDialog({ defaultOpen = false, label = 'New lead', size = 'sm' }: { defaultOpen?: boolean; label?: string; size?: 'default' | 'sm' }) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)

  const leadCreated = () => {
    setOpen(false)
    if (defaultOpen) router.replace('/crm/leads')
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size={size} />}>
        <Plus data-icon="inline-start" />
        {label}
      </DialogTrigger>
      <DialogContent className="max-h-[min(42rem,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New lead</DialogTitle>
          <DialogDescription>Add a prospect manually. Email or phone is required.</DialogDescription>
        </DialogHeader>
        <NewLeadForm onSuccess={leadCreated} />
      </DialogContent>
    </Dialog>
  )
}

function NewLeadForm({ onSuccess }: { onSuccess: () => void }) {
  const [state, formAction, pending] = useActionState(createLead, initialState)
  const errors = state.fieldErrors ?? {}

  useEffect(() => {
    if (state.success) onSuccess()
  }, [state.success, onSuccess])

  return (
    <form action={formAction} noValidate className="-mx-4 -mb-4 flex min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 overflow-y-auto px-4 pb-4">
        <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.firstName)}>
            <FieldLabel htmlFor="new-lead-first-name">First name</FieldLabel>
            <Input id="new-lead-first-name" name="firstName" required aria-invalid={Boolean(errors.firstName)} />
            <FieldError>{errors.firstName?.[0]}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errors.lastName)}>
            <FieldLabel htmlFor="new-lead-last-name">Last name</FieldLabel>
            <Input id="new-lead-last-name" name="lastName" required aria-invalid={Boolean(errors.lastName)} />
            <FieldError>{errors.lastName?.[0]}</FieldError>
          </Field>
        </div>
        <Field data-invalid={Boolean(errors.companyName)}>
          <FieldLabel htmlFor="new-lead-company">Company</FieldLabel>
          <Input id="new-lead-company" name="companyName" aria-invalid={Boolean(errors.companyName)} />
          <FieldError>{errors.companyName?.[0]}</FieldError>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.email)}>
            <FieldLabel htmlFor="new-lead-email">Email</FieldLabel>
            <Input id="new-lead-email" name="email" type="email" aria-invalid={Boolean(errors.email)} />
            <FieldError>{errors.email?.[0]}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errors.phone)}>
            <FieldLabel htmlFor="new-lead-phone">Phone</FieldLabel>
            <Input id="new-lead-phone" name="phone" type="tel" aria-invalid={Boolean(errors.phone)} />
            <FieldError>{errors.phone?.[0]}</FieldError>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.fleetSize)}>
            <FieldLabel htmlFor="new-lead-fleet-size">Fleet size</FieldLabel>
            <Input id="new-lead-fleet-size" name="fleetSize" type="number" min="0" step="1" placeholder="12" aria-invalid={Boolean(errors.fleetSize)} />
            <FieldError>{errors.fleetSize?.[0]}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errors.preferredNetwork)}>
            <FieldLabel htmlFor="new-lead-preferred-network">Preferred network</FieldLabel>
            <Input id="new-lead-preferred-network" name="preferredNetwork" placeholder="Pilot Flying J" aria-invalid={Boolean(errors.preferredNetwork)} />
            <FieldError>{errors.preferredNetwork?.[0]}</FieldError>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.estimatedMonthlyGallons)}>
            <FieldLabel htmlFor="new-lead-estimated-gallons">Estimated monthly gallons</FieldLabel>
            <Input id="new-lead-estimated-gallons" name="estimatedMonthlyGallons" type="number" min="0" step="1" placeholder="8,500" aria-invalid={Boolean(errors.estimatedMonthlyGallons)} />
            <FieldError>{errors.estimatedMonthlyGallons?.[0]}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errors.accountType)}>
            <FieldLabel htmlFor="new-lead-account-type">Account type</FieldLabel>
            <NativeSelect
              id="new-lead-account-type"
              name="accountType"
              required
              defaultValue=""
              aria-invalid={Boolean(errors.accountType)}
              className="w-full"
            >
              <NativeSelectOption value="" disabled>Select account type</NativeSelectOption>
              <NativeSelectOption value="prepaid_account">Prepaid Account</NativeSelectOption>
              <NativeSelectOption value="deposit">Deposit</NativeSelectOption>
              <NativeSelectOption value="credit_line">Credit Line</NativeSelectOption>
            </NativeSelect>
            <FieldError>{errors.accountType?.[0]}</FieldError>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.source)}>
            <FieldLabel htmlFor="new-lead-source">Source</FieldLabel>
            <Input id="new-lead-source" name="source" placeholder="Referral, website, cold call" aria-invalid={Boolean(errors.source)} />
            <FieldError>{errors.source?.[0]}</FieldError>
          </Field>
        </div>
        <Field data-invalid={Boolean(errors.notes)}>
          <FieldLabel htmlFor="new-lead-notes">Notes</FieldLabel>
          <Textarea id="new-lead-notes" name="notes" aria-invalid={Boolean(errors.notes)} />
          <FieldError>{errors.notes?.[0]}</FieldError>
        </Field>
        </FieldGroup>
        {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      </div>
      <DialogFooter className="mx-0 mb-0 shrink-0">
        <Button type="submit" disabled={pending}>{pending ? 'Adding…' : 'Add lead'}</Button>
      </DialogFooter>
    </form>
  )
}

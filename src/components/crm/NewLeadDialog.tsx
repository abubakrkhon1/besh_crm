'use client'

import { useActionState, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { createLead, CreateLeadState } from '@/app/actions/leads'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
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
      <DialogContent className="sm:max-w-xl">
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

  useEffect(() => {
    if (state.success) onSuccess()
  }, [state.success, onSuccess])

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="new-lead-first-name">First name</FieldLabel><Input id="new-lead-first-name" name="firstName" required /></Field>
          <Field><FieldLabel htmlFor="new-lead-last-name">Last name</FieldLabel><Input id="new-lead-last-name" name="lastName" required /></Field>
        </div>
        <Field><FieldLabel htmlFor="new-lead-company">Company</FieldLabel><Input id="new-lead-company" name="companyName" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field><FieldLabel htmlFor="new-lead-email">Email</FieldLabel><Input id="new-lead-email" name="email" type="email" /></Field>
          <Field><FieldLabel htmlFor="new-lead-phone">Phone</FieldLabel><Input id="new-lead-phone" name="phone" type="tel" /></Field>
        </div>
        <Field><FieldLabel htmlFor="new-lead-notes">Notes</FieldLabel><Textarea id="new-lead-notes" name="notes" /></Field>
      </FieldGroup>
      {state.error && <p role="alert" className="text-sm text-destructive">{state.error}</p>}
      <DialogFooter>
        <Button type="submit" disabled={pending}>{pending ? 'Adding…' : 'Add lead'}</Button>
      </DialogFooter>
    </form>
  )
}

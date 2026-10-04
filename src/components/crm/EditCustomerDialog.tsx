'use client'

import { useState, useTransition } from 'react'
import { Edit, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { updateCustomer, type UpdateCustomerResult } from '@/app/actions/customers'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import type { UpdateCustomerField } from '@/lib/validation/customers'

type EditableCustomer = {
  id: string
  companyName: string
  contactName: string
  email: string
  phone: string
  status: 'active' | 'pending' | 'suspended' | 'closed'
  creditLimit: number
  notes: string
}

const initialResult: UpdateCustomerResult = { ok: true, message: '' }

export function EditCustomerDialog({ customer }: { customer: EditableCustomer }) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<UpdateCustomerResult>(initialResult)

  function fieldError(field: UpdateCustomerField) {
    return result.fieldErrors?.[field]?.[0]
  }

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) setResult(initialResult)
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setResult(initialResult)
    startTransition(async () => {
      const updateResult = await updateCustomer({
        customerId: customer.id,
        companyName: form.get('companyName'),
        contactName: form.get('contactName'),
        email: form.get('email'),
        phone: form.get('phone'),
        status: form.get('status'),
        creditLimit: form.get('creditLimit'),
        notes: form.get('notes'),
      })
      setResult(updateResult)
      if (!updateResult.ok) return
      toast.success(updateResult.message)
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button type="button" size="sm" />}>
        <Edit data-icon="inline-start" />
        Edit Customer
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-xl">
        <form onSubmit={submit} className="flex max-h-[calc(100dvh-4rem)] min-h-0 flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Edit customer</DialogTitle>
            <DialogDescription>Update the CRM customer profile. WEX identifiers, balances, and synchronized spending totals remain provider-controlled.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="min-h-0 overflow-y-auto py-5 pr-1">
            {!result.ok && !result.fieldErrors && <Alert variant="destructive"><AlertTitle>Customer could not be updated</AlertTitle><AlertDescription>{result.message}</AlertDescription></Alert>}
            <Field data-invalid={Boolean(fieldError('companyName'))}>
              <FieldLabel htmlFor="edit-customer-company-name">Company name</FieldLabel>
              <Input id="edit-customer-company-name" name="companyName" defaultValue={customer.companyName} maxLength={160} required aria-invalid={Boolean(fieldError('companyName'))} />
              <FieldError>{fieldError('companyName')}</FieldError>
            </Field>
            <FieldGroup className="sm:grid sm:grid-cols-2">
              <Field data-invalid={Boolean(fieldError('contactName'))}>
                <FieldLabel htmlFor="edit-customer-contact-name">Primary contact</FieldLabel>
                <Input id="edit-customer-contact-name" name="contactName" defaultValue={customer.contactName} maxLength={120} aria-invalid={Boolean(fieldError('contactName'))} />
                <FieldError>{fieldError('contactName')}</FieldError>
              </Field>
              <Field data-invalid={Boolean(fieldError('status'))}>
                <FieldLabel htmlFor="edit-customer-status">Status</FieldLabel>
                <NativeSelect id="edit-customer-status" name="status" defaultValue={customer.status} className="w-full" aria-invalid={Boolean(fieldError('status'))}>
                  <NativeSelectOption value="active">Active</NativeSelectOption>
                  <NativeSelectOption value="pending">Pending</NativeSelectOption>
                  <NativeSelectOption value="suspended">Suspended</NativeSelectOption>
                  <NativeSelectOption value="closed">Closed</NativeSelectOption>
                </NativeSelect>
                <FieldError>{fieldError('status')}</FieldError>
              </Field>
            </FieldGroup>
            <FieldGroup className="sm:grid sm:grid-cols-2">
              <Field data-invalid={Boolean(fieldError('email'))}>
                <FieldLabel htmlFor="edit-customer-email">Primary email</FieldLabel>
                <Input id="edit-customer-email" name="email" type="email" inputMode="email" defaultValue={customer.email} maxLength={254} aria-invalid={Boolean(fieldError('email'))} />
                <FieldDescription>This address is used when inviting the company to its portal.</FieldDescription>
                <FieldError>{fieldError('email')}</FieldError>
              </Field>
              <Field data-invalid={Boolean(fieldError('phone'))}>
                <FieldLabel htmlFor="edit-customer-phone">Phone</FieldLabel>
                <Input id="edit-customer-phone" name="phone" type="tel" defaultValue={customer.phone} maxLength={50} aria-invalid={Boolean(fieldError('phone'))} />
                <FieldError>{fieldError('phone')}</FieldError>
              </Field>
            </FieldGroup>
            <Field data-invalid={Boolean(fieldError('creditLimit'))}>
              <FieldLabel htmlFor="edit-customer-credit-limit">Credit limit</FieldLabel>
              <Input id="edit-customer-credit-limit" name="creditLimit" type="number" inputMode="decimal" defaultValue={customer.creditLimit} min="0" max="100000000" step="0.01" required aria-invalid={Boolean(fieldError('creditLimit'))} />
              <FieldError>{fieldError('creditLimit')}</FieldError>
            </Field>
            <Field data-invalid={Boolean(fieldError('notes'))}>
              <FieldLabel htmlFor="edit-customer-notes">Internal notes</FieldLabel>
              <Textarea id="edit-customer-notes" name="notes" defaultValue={customer.notes} maxLength={2000} aria-invalid={Boolean(fieldError('notes'))} />
              <FieldDescription>Visible to CRM staff; not shown in the customer portal.</FieldDescription>
              <FieldError>{fieldError('notes')}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending && <LoaderCircle data-icon="inline-start" className="animate-spin" />}{pending ? 'Saving…' : 'Save changes'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

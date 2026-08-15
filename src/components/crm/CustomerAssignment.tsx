'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { assignFuelCard } from '@/app/actions/fuel-cards'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

export function CustomerAssignment({ cardId, currentId, customers }: { cardId: string, currentId: string | null, customers: { id: string, name: string }[] }) {
  const router = useRouter()
  const [value, setValue] = useState(currentId ?? '')
  const [pending, startTransition] = useTransition()
  return <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
    <Field className="min-w-0 flex-1">
      <FieldLabel htmlFor="fuel-card-customer">Assigned customer</FieldLabel>
      <NativeSelect id="fuel-card-customer" className="w-full" value={value} onChange={(event) => setValue(event.target.value)} disabled={pending}>
        <NativeSelectOption value="">Unmatched</NativeSelectOption>
        {customers.map((customer) => <NativeSelectOption key={customer.id} value={customer.id}>{customer.name}</NativeSelectOption>)}
      </NativeSelect>
    </Field>
    <Button disabled={pending || value === (currentId ?? '')} onClick={() => startTransition(async () => {
      const result = await assignFuelCard({ fuelCardId: cardId, customerId: value || null })
      if (result.ok) {
        toast.success(result.message)
        router.refresh()
      } else toast.error(result.message)
    })}>
      {pending && <Loader2 data-icon="inline-start" className="animate-spin" />}
      {pending ? 'Saving…' : 'Save assignment'}
    </Button>
  </div>
}

'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { assignFuelCard } from '@/app/actions/fuel-cards'
import { Button } from '@/components/ui/button'

export function CustomerAssignment({ cardId, currentId, customers }: { cardId: string, currentId: string | null, customers: { id: string, name: string }[] }) {
  const [value, setValue] = useState(currentId ?? '')
  const [pending, startTransition] = useTransition()
  return <div className="flex flex-col gap-3 sm:flex-row"><select className="h-9 flex-1 rounded-lg border bg-background px-3 text-sm" value={value} onChange={(e) => setValue(e.target.value)}><option value="">Unmatched</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><Button disabled={pending} onClick={() => startTransition(async () => { const r = await assignFuelCard({ fuelCardId: cardId, customerId: value || null }); if (r.ok) toast.success(r.message); else toast.error(r.message) })}>{pending ? 'Saving…' : 'Save assignment'}</Button></div>
}

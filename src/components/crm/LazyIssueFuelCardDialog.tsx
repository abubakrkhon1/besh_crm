'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'
import { CreditCard, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

type CustomerOption = { id: string; name: string }

const IssueFuelCardDialog = dynamic(
  () => import('@/components/crm/FuelCardManagementControls').then((module) => module.IssueFuelCardDialog),
  {
    ssr: false,
    loading: () => <Button type="button" size="lg" disabled><LoaderCircle className="animate-spin" data-icon="inline-start" />Loading form…</Button>,
  },
)

export function LazyIssueFuelCardDialog({ customers }: { customers: CustomerOption[] }) {
  const [requested, setRequested] = useState(false)
  if (requested) return <IssueFuelCardDialog customers={customers} defaultOpen />
  return <Button type="button" size="lg" onClick={() => setRequested(true)}><CreditCard data-icon="inline-start" />Issue card</Button>
}

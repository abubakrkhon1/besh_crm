import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { CustomerAssignment } from '@/components/crm/CustomerAssignment'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function FuelCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, db = await createClient()
  const [{ data: card }, { data: customers }, { data: mapping }] = await Promise.all([
    db.from('fuel_cards').select('id,card_last4,provider,customer_id,status,driver_name,external_driver_id,unit_number,policy_number,payroll_status,payroll_use,is_overridden,override_code,gps_id,vin,zone_id,last_synced_at,customers(company_name,contact_name)').eq('id', id).single(),
    db.from('customers').select('id,company_name,contact_name').order('company_name'),
    db.from('fuel_card_customer_mappings').select('match_method,match_confidence,is_confirmed,confirmed_at').eq('fuel_card_id', id).maybeSingle(),
  ])
  if (!card) notFound()
  const customerOptions = (customers ?? []).map((c: any) => ({ id: c.id, name: c.company_name ?? c.contact_name ?? 'Unnamed customer' }))
  const fields = [['Status', card.status], ['Assigned customer', (card.customers as any)?.company_name ?? (card.customers as any)?.contact_name ?? 'Unmatched'], ['Driver', card.driver_name], ['External driver ID', card.external_driver_id], ['Unit number', card.unit_number], ['Policy number', card.policy_number], ['Payroll status', card.payroll_status], ['Payroll use', card.payroll_use], ['Override', card.is_overridden ? `Yes${card.override_code ? ` (${card.override_code})` : ''}` : 'No'], ['VIN', card.vin], ['GPS ID', card.gps_id], ['Zone ID', card.zone_id], ['Provider', card.provider], ['Last synchronized', new Date(card.last_synced_at).toLocaleString()]]
  return <div className="space-y-6 pb-12"><Link href="/crm/fuel-cards" className={buttonVariants({ variant: 'ghost' })}><ArrowLeft />Fuel Cards</Link><div className="flex items-center gap-3"><h1 className="font-mono text-2xl font-semibold">•••• {card.card_last4}</h1><Badge variant="outline">{card.status}</Badge></div>
    <Card><CardHeader><CardTitle>Card details</CardTitle></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{fields.map(([label, value]) => <div key={label}><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value || '—'}</p></div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>Customer assignment</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">{mapping ? `${mapping.is_confirmed ? 'Confirmed' : 'Automatic'} ${mapping.match_method} match (${mapping.match_confidence}).` : 'No confirmed mapping. Assign only after verifying the customer.'}</p><CustomerAssignment cardId={card.id} currentId={card.customer_id} customers={customerOptions} /></CardContent></Card>
  </div>
}

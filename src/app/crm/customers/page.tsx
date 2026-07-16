import Link from 'next/link'
import { Search } from 'lucide-react'
import { TablePagination } from '@/components/crm/ui/TablePagination'
import { getTablePageSize } from '@/components/crm/ui/table-page-sizes'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams
  const q = (params.q ?? '').trim().slice(0, 100)
  const page = Math.max(1, Number(params.page) || 1)
  const pageSize = getTablePageSize(params.pageSize)
  const from = (page - 1) * pageSize
  const db = await createClient()
  let query = db.from('customers').select('id,company_name,contact_name,email,phone,status,wex_carrier_id,wex_company_xref,last_synced_at,fuel_cards(count),fuel_transactions(count)', { count: 'exact' })
  if (q) {
    const safe = q.replace(/[%(),]/g, '')
    query = query.or(`company_name.ilike.%${safe}%,contact_name.ilike.%${safe}%,email.ilike.%${safe}%,wex_carrier_id.ilike.%${safe}%,wex_company_xref.ilike.%${safe}%`)
  }
  const { data: customers, count, error } = await query.order('last_synced_at', { ascending: false, nullsFirst: false }).range(from, from + pageSize - 1)
  return <div className="space-y-6 pb-12">
    <div><h1 className="text-2xl font-semibold">Customers</h1><p className="text-sm text-muted-foreground">Customer accounts synchronized to Supabase from WEX carrier data.</p></div>
    <form className="flex max-w-xl gap-2" action="/crm/customers"><input type="hidden" name="pageSize" value={pageSize}/><label className="relative flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground"/><input name="q" defaultValue={q} placeholder="Search customer, carrier ID or company reference" className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-sm"/></label><button className={buttonVariants({ variant: 'outline' })}>Search</button></form>
    {error ? <Card><CardContent className="p-8 text-destructive">Customers could not be loaded from Supabase.</CardContent></Card> : !customers?.length ? <Card><CardContent className="p-10 text-center text-muted-foreground">No synchronized customers found.</CardContent></Card> : <Card className="overflow-x-auto py-0"><Table><TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>WEX carrier</TableHead><TableHead>Company reference</TableHead><TableHead>Status</TableHead><TableHead>Cards</TableHead><TableHead>Transactions</TableHead><TableHead>Last synchronized</TableHead></TableRow></TableHeader><TableBody>{customers.map((customer: any) => <TableRow key={customer.id} className="relative cursor-pointer"><TableCell><Link href={`/crm/customers/${customer.id}`} className="font-medium after:absolute after:inset-0 after:content-[''] hover:underline">{customer.company_name ?? customer.contact_name ?? 'Unnamed customer'}<span className="sr-only"> — view customer</span></Link><p className="text-xs text-muted-foreground">{customer.email ?? customer.phone ?? 'No contact details'}</p></TableCell><TableCell>{customer.wex_carrier_id ?? '—'}</TableCell><TableCell>{customer.wex_company_xref ?? '—'}</TableCell><TableCell><Badge variant="outline">{customer.status}</Badge></TableCell><TableCell>{customer.fuel_cards?.[0]?.count ?? 0}</TableCell><TableCell>{customer.fuel_transactions?.[0]?.count ?? 0}</TableCell><TableCell>{customer.last_synced_at ? new Date(customer.last_synced_at).toLocaleString() : '—'}</TableCell></TableRow>)}</TableBody></Table></Card>}
    <TablePagination page={page} pageSize={pageSize} total={count ?? 0} itemLabel="customers" searchParams={{ q, pageSize }} />
  </div>
}

import Link from 'next/link'
import { Search } from 'lucide-react'
import { TablePagination } from '@/components/crm/ui/TablePagination'
import { getTablePageSize } from '@/components/crm/ui/table-page-sizes'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams
  const q = (params.q ?? '').trim().slice(0, 100), status = (params.status ?? '').trim().slice(0, 30)
  const page = Math.max(1, Number(params.page) || 1), pageSize = getTablePageSize(params.pageSize, 50), from = (page - 1) * pageSize
  const db = await createClient()
  let customerIds: string[] = []
  if (q) {
    const safe = q.replace(/[%(),]/g, '')
    const { data } = await db.from('customers').select('id').or(`company_name.ilike.%${safe}%,contact_name.ilike.%${safe}%`).limit(100)
    customerIds = (data ?? []).map((customer) => customer.id)
  }
  let query: any = db.from('fuel_transactions').select('id,provider_transaction_id,customer_id,fuel_card_id,merchant_name,merchant_address,merchant_state,gallons,amount,savings,status,transaction_date,wex_carrier_id,customers(company_name,contact_name),fuel_cards(card_last4)', { count: 'exact' }).eq('provider', 'wex_efs')
  if (status) query = query.eq('status', status)
  if (q) {
    const safe = q.replace(/[%(),]/g, '')
    const customerFilter = customerIds.length ? `,customer_id.in.(${customerIds.join(',')})` : ''
    query = query.or(`provider_transaction_id.ilike.%${safe}%,merchant_name.ilike.%${safe}%,merchant_state.ilike.%${safe}%,wex_carrier_id.ilike.%${safe}%${customerFilter}`)
  }
  const { data: transactions, count, error } = await query.order('transaction_date', { ascending: false }).range(from, from + pageSize - 1)
  return <div className="space-y-6 pb-12">
    <div><h1 className="text-2xl font-semibold">Transactions</h1><p className="text-sm text-muted-foreground">WEX transactions stored in Supabase and linked to customers and cards.</p></div>
    <form className="flex flex-col gap-2 sm:flex-row" action="/crm/transactions"><input type="hidden" name="pageSize" value={pageSize}/><label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground"/><input name="q" defaultValue={q} placeholder="Search merchant, customer, carrier or transaction ID" className="h-9 w-full rounded-lg border bg-background pl-9 pr-3 text-sm"/></label><select name="status" defaultValue={status} className="h-9 rounded-lg border bg-background px-3 text-sm"><option value="">All statuses</option><option value="posted">Posted</option><option value="pending">Pending</option><option value="declined">Declined</option><option value="reversed">Reversed</option></select><button className={buttonVariants({ variant: 'outline' })}>Apply</button></form>
    {error ? <Card><CardContent className="p-8 text-destructive">Transactions could not be loaded from Supabase.</CardContent></Card> : !transactions?.length ? <Card><CardContent className="p-10 text-center text-muted-foreground">No synchronized transactions match these filters.</CardContent></Card> : <Card className="overflow-x-auto py-0"><Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead>Card</TableHead><TableHead>Merchant</TableHead><TableHead>Gallons</TableHead><TableHead>Amount</TableHead><TableHead>Savings</TableHead><TableHead>Status</TableHead><TableHead>WEX ID</TableHead></TableRow></TableHeader><TableBody>{transactions.map((transaction: any) => <TableRow key={transaction.id}><TableCell>{new Date(transaction.transaction_date).toLocaleString()}</TableCell><TableCell>{transaction.customer_id ? <Link href={`/crm/customers/${transaction.customer_id}`} className="font-medium hover:underline">{transaction.customers?.company_name ?? transaction.customers?.contact_name ?? 'Customer'}</Link> : <Badge variant="destructive">Unmatched</Badge>}</TableCell><TableCell>{transaction.fuel_card_id ? <Link href={`/crm/fuel-cards/${transaction.fuel_card_id}`} className="font-mono hover:underline">•••• {transaction.fuel_cards?.card_last4}</Link> : '—'}</TableCell><TableCell>{transaction.merchant_name ?? 'Unknown'}<p className="text-xs text-muted-foreground">{[transaction.merchant_address, transaction.merchant_state].filter(Boolean).join(', ')}</p></TableCell><TableCell>{transaction.gallons ?? '—'}</TableCell><TableCell className="font-medium">${Number(transaction.amount).toFixed(2)}</TableCell><TableCell>${Number(transaction.savings).toFixed(2)}</TableCell><TableCell><Badge variant="outline">{transaction.status}</Badge></TableCell><TableCell className="font-mono text-xs">{transaction.provider_transaction_id}</TableCell></TableRow>)}</TableBody></Table></Card>}
    <TablePagination page={page} pageSize={pageSize} total={count ?? 0} itemLabel="transactions" searchParams={{ q, status, pageSize }} />
  </div>
}

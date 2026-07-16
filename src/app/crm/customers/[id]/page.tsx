import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import {
  CustomerSectionTabs,
  type CustomerSection,
} from "@/components/crm/CustomerSectionTabs"
import { TablePagination } from "@/components/crm/ui/TablePagination"
import { getTablePageSize } from "@/components/crm/ui/table-page-sizes"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createClient } from "@/lib/supabase/server"

type CardRecord = {
  id: string
  card_last4: string | null
  status: string
  driver_name: string | null
  external_driver_id: string | null
  unit_number: string | null
  policy_number: string | null
  last_synced_at: string
}

const sections: CustomerSection[] = ["fuel-cards", "drivers", "transactions"]

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const { id } = await params
  const query = await searchParams
  const db = await createClient()
  const section = sections.includes(query.view as CustomerSection)
    ? (query.view as CustomerSection)
    : "fuel-cards"

  const { data: customer } = await db
    .from("customers")
    .select("id,company_name,contact_name,email,phone,status,current_balance,monthly_spend,lifetime_spend,credit_limit")
    .eq("id", id)
    .single()

  if (!customer) notFound()

  const name = customer.company_name ?? customer.contact_name ?? "Customer"

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div>
        <Link href="/crm/customers" className={buttonVariants({ variant: "ghost" })}>
          <ArrowLeft data-icon="inline-start" />
          Customers
        </Link>
      </div>

      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{name}</h1>
          <Badge variant="outline">{customer.status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {[customer.email, customer.phone].filter(Boolean).join(" · ") || "No contact details"}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Credit limit", customer.credit_limit],
          ["Current balance", customer.current_balance],
          ["Monthly spend", customer.monthly_spend],
          ["Lifetime spend", customer.lifetime_spend],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 text-xl font-semibold">${Number(value).toLocaleString()}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <CustomerSectionTabs value={section} />

      {section === "fuel-cards" && <FuelCardsTable customerId={id} query={query} />}
      {section === "drivers" && <DriversTable customerId={id} query={query} />}
      {section === "transactions" && <TransactionsTable customerId={id} query={query} />}
    </div>
  )
}

async function FuelCardsTable({ customerId, query }: { customerId: string; query: Record<string, string | undefined> }) {
  const db = await createClient()
  const page = Math.max(1, Number(query.cardsPage) || 1)
  const pageSize = getTablePageSize(query.cardsPageSize, 10)
  const { data: cards, count } = await db
    .from("fuel_cards")
    .select("id,card_last4,status,driver_name,external_driver_id,unit_number,policy_number,last_synced_at", { count: "exact" })
    .eq("customer_id", customerId)
    .order("status", { ascending: true })
    .order("last_synced_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  return (
    <TableCard
      empty={!cards?.length}
      emptyMessage="No fuel cards are linked to this customer."
      footer={Boolean(cards?.length) && (
        <TablePagination page={page} pageSize={pageSize} total={count ?? 0} itemLabel="cards" pageParam="cardsPage" pageSizeParam="cardsPageSize" searchParams={{ view: "fuel-cards", cardsPageSize: pageSize }} />
      )}
    >
      <Table>
        <TableHeader><TableRow><TableHead>Card</TableHead><TableHead>Status</TableHead><TableHead>Driver</TableHead><TableHead>Driver ID</TableHead><TableHead>Unit</TableHead><TableHead>Policy</TableHead><TableHead>Last synced</TableHead></TableRow></TableHeader>
        <TableBody>{(cards ?? []).map((card: CardRecord) => <TableRow key={card.id} className="relative cursor-pointer"><TableCell><Link href={`/crm/fuel-cards/${card.id}`} className="font-mono font-medium after:absolute after:inset-0 after:content-[''] hover:underline">•••• {card.card_last4}</Link></TableCell><TableCell><Badge variant="outline">{card.status}</Badge></TableCell><TableCell>{card.driver_name ?? "—"}</TableCell><TableCell>{card.external_driver_id ?? "—"}</TableCell><TableCell>{card.unit_number ?? "—"}</TableCell><TableCell>{card.policy_number ?? "—"}</TableCell><TableCell>{new Date(card.last_synced_at).toLocaleString()}</TableCell></TableRow>)}</TableBody>
      </Table>
    </TableCard>
  )
}

async function DriversTable({ customerId, query }: { customerId: string; query: Record<string, string | undefined> }) {
  const db = await createClient()
  const page = Math.max(1, Number(query.driversPage) || 1)
  const pageSize = getTablePageSize(query.driversPageSize, 25)
  const { data } = await db
    .from("fuel_cards")
    .select("id,card_last4,status,driver_name,external_driver_id,unit_number,last_synced_at")
    .eq("customer_id", customerId)
    .or("external_driver_id.not.is.null,driver_name.not.is.null")
    .order("driver_name", { ascending: true, nullsFirst: false })

  const driverMap = new Map<string, { name: string | null; externalId: string | null; cards: CardRecord[] }>()
  for (const card of (data ?? []) as CardRecord[]) {
    const key = card.external_driver_id || card.driver_name?.trim().toLocaleLowerCase() || card.id
    const driver = driverMap.get(key) ?? { name: card.driver_name, externalId: card.external_driver_id, cards: [] }
    driver.cards.push(card)
    driverMap.set(key, driver)
  }
  const drivers = Array.from(driverMap.values())
  const visibleDrivers = drivers.slice((page - 1) * pageSize, page * pageSize)

  return (
    <TableCard
      empty={!drivers.length}
      emptyMessage="No driver information is stored on this customer's fuel cards."
      footer={Boolean(drivers.length) && (
        <TablePagination page={page} pageSize={pageSize} total={drivers.length} itemLabel="drivers" pageParam="driversPage" pageSizeParam="driversPageSize" searchParams={{ view: "drivers", driversPageSize: pageSize }} />
      )}
    >
      <Table>
        <TableHeader><TableRow><TableHead>Driver</TableHead><TableHead>Driver ID</TableHead><TableHead>Cards</TableHead><TableHead>Active cards</TableHead><TableHead>Units</TableHead><TableHead>Last synced</TableHead></TableRow></TableHeader>
        <TableBody>{visibleDrivers.map((driver) => {
          const latestSync = driver.cards.reduce((latest, card) => card.last_synced_at > latest ? card.last_synced_at : latest, "")
          const units = Array.from(new Set(driver.cards.map((card) => card.unit_number).filter(Boolean)))
          return <TableRow key={driver.externalId ?? driver.name}><TableCell className="font-medium">{driver.name ?? "Unnamed driver"}</TableCell><TableCell>{driver.externalId ?? "—"}</TableCell><TableCell>{driver.cards.length}</TableCell><TableCell>{driver.cards.filter((card) => card.status?.toUpperCase() === "ACTIVE").length}</TableCell><TableCell>{units.join(", ") || "—"}</TableCell><TableCell>{latestSync ? new Date(latestSync).toLocaleString() : "—"}</TableCell></TableRow>
        })}</TableBody>
      </Table>
    </TableCard>
  )
}

async function TransactionsTable({ customerId, query }: { customerId: string; query: Record<string, string | undefined> }) {
  const db = await createClient()
  const page = Math.max(1, Number(query.transactionsPage) || 1)
  const pageSize = getTablePageSize(query.transactionsPageSize, 25)
  const { data: transactions, count } = await db
    .from("fuel_transactions")
    .select("id,provider_transaction_id,merchant_name,merchant_state,gallons,amount,savings,status,transaction_date,fuel_cards(id,card_last4)", { count: "exact" })
    .eq("customer_id", customerId)
    .order("transaction_date", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  return (
    <TableCard
      empty={!transactions?.length}
      emptyMessage="No synchronized transactions exist for this customer."
      footer={Boolean(transactions?.length) && (
        <TablePagination page={page} pageSize={pageSize} total={count ?? 0} itemLabel="transactions" pageParam="transactionsPage" pageSizeParam="transactionsPageSize" searchParams={{ view: "transactions", transactionsPageSize: pageSize }} />
      )}
    >
      <Table>
        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Merchant</TableHead><TableHead>Card</TableHead><TableHead>Gallons</TableHead><TableHead>Amount</TableHead><TableHead>Savings</TableHead><TableHead>Status</TableHead><TableHead>WEX ID</TableHead></TableRow></TableHeader>
        <TableBody>{(transactions ?? []).map((transaction: any) => <TableRow key={transaction.id}><TableCell>{new Date(transaction.transaction_date).toLocaleString()}</TableCell><TableCell>{transaction.merchant_name ?? "Unknown"}{transaction.merchant_state ? `, ${transaction.merchant_state}` : ""}</TableCell><TableCell>{transaction.fuel_cards ? <Link href={`/crm/fuel-cards/${transaction.fuel_cards.id}`} className="font-mono hover:underline">•••• {transaction.fuel_cards.card_last4}</Link> : "—"}</TableCell><TableCell>{transaction.gallons ?? "—"}</TableCell><TableCell className="font-medium">${Number(transaction.amount).toFixed(2)}</TableCell><TableCell>${Number(transaction.savings).toFixed(2)}</TableCell><TableCell><Badge variant="outline">{transaction.status}</Badge></TableCell><TableCell className="font-mono text-xs">{transaction.provider_transaction_id}</TableCell></TableRow>)}</TableBody>
      </Table>
    </TableCard>
  )
}

function TableCard({ children, empty, emptyMessage, footer }: { children: React.ReactNode; empty: boolean; emptyMessage: string; footer: React.ReactNode }) {
  return (
    <Card className="overflow-x-auto py-0">
      <CardContent className="p-0">
        {empty ? <div className="p-10 text-center text-sm text-muted-foreground">{emptyMessage}</div> : children}
      </CardContent>
      {footer && <CardFooter>{footer}</CardFooter>}
    </Card>
  )
}

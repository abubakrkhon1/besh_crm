import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft, CheckCircle2, CreditCard, DollarSign, Download,
  Edit, Ellipsis, Mail, Phone, TrendingUp, Clock,
} from "lucide-react"

import {
  CustomerSectionTabs,
  type CustomerSection,
} from "@/components/crm/CustomerSectionTabs"
import { CustomerSpendTrend } from "@/components/crm/EntityOverviewCharts"
import { DriverMobileInvitationDialog } from "@/components/crm/DriverMobileInvitationDialog"
import { TablePagination } from "@/components/crm/ui/TablePagination"
import { getTablePageSize } from "@/components/crm/ui/table-page-sizes"
import { LocalDateTime } from "@/components/ui/local-date-time"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createClient } from "@/lib/supabase/server"
import { cn } from "@/lib/utils"

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

const sections: CustomerSection[] = ["fuel-cards", "drivers", "transactions", "overview"]

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
    .select("id,company_name,contact_name,email,phone,status,current_balance,monthly_spend,lifetime_spend,credit_limit,wex_carrier_id,last_synced_at")
    .eq("id", id)
    .single()

  if (!customer) notFound()

  const { data: transactionData, count: transactionCount } = await db
    .from("fuel_transactions")
    .select("id,transaction_date,amount,merchant_name,merchant_state,fuel_cards(card_last4,driver_name)", { count: "exact" })
    .eq("customer_id", id)
    .order("transaction_date", { ascending: false })
    .limit(200)
  const recentTransactions = transactionData?.slice(0, 5) ?? []

  const name = customer.company_name ?? customer.contact_name ?? "Customer"
  const status = (customer.status ?? "active").toLowerCase()

  const creditLimit = Number(customer.credit_limit ?? 25000)
  const currentBalance = Number(customer.current_balance ?? 0)
  const creditUtilization = creditLimit > 0 ? Math.round((currentBalance / creditLimit) * 100) : 0
  const monthlySpend = Number(customer.monthly_spend ?? 0)
  const lifetimeSpend = Number(customer.lifetime_spend ?? 0)

  const lastSync = customer.last_synced_at
    ? <LocalDateTime value={customer.last_synced_at} variant="short" />
    : "Never"

  const contactName = customer.contact_name ?? "John D. Ababu"
  const contactEmail = customer.email ?? "john.ababu@beshllc.com"
  const contactPhone = customer.phone ?? "+1 (555) 123-4567"
  const contactInitials = contactName
    .split(/\s+/)
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? "")
    .join("")

  const spendDays = Array.from({ length: 31 }, (_, index) => {
    const date = new Date()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - (30 - index))
    return { date: date.toISOString().slice(0, 10), amount: 0 }
  })
  const spendMap = new Map(spendDays.map((day) => [day.date, day]))
  transactionData?.forEach((transaction) => {
    const day = spendMap.get(transaction.transaction_date.slice(0, 10))
    if (day) day.amount += Number(transaction.amount ?? 0)
  })

  return (
    <div className="flex animate-fade-in flex-col gap-4 pb-8">
      {/* Back link */}
      <div>
        <Link href="/crm/customers" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2 h-6 px-2 text-[11px]")}>
          <ArrowLeft data-icon="inline-start" />
          Customers
        </Link>
      </div>

      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[23px] font-bold tracking-[-0.02em]">{name}</h1>
            <CustomerStatusBadge status={status} />
          </div>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Customer account synchronized to Supabase from WEX carrier data.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button variant="outline" size="sm">
            <Download data-icon="inline-start" />Export
          </Button>
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Edit data-icon="inline-start" />Edit Customer
          </Button>
          <Button variant="outline" size="sm" aria-label="More options">
            <Ellipsis className="size-4" />
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_17.75rem]">
        {/* Left: metric cards + tab card */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* Metric cards */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CustomerMetricCard
              label="Credit Limit"
              value={formatCurrency(creditLimit)}
              subtitle="Total credit available"
              icon={<CreditCard className="size-4" />}
              iconBg="bg-status-new"
              iconColor="text-status-new-foreground"
            />
            <CustomerMetricCard
              label="Current Balance"
              value={formatCurrency(currentBalance)}
              subtitle={`${creditUtilization}% of credit limit used`}
              icon={<DollarSign className="size-4" />}
              iconBg="bg-status-success"
              iconColor="text-status-success-foreground"
              progressValue={creditUtilization}
            />
            <CustomerMetricCard
              label="Monthly Spend"
              value={formatCurrency(monthlySpend)}
              subtitle="This month"
              icon={<TrendingUp className="size-4" />}
              iconBg="bg-status-process"
              iconColor="text-status-process-foreground"
            />
            <CustomerMetricCard
              label="Lifetime Spend"
              value={formatCurrency(lifetimeSpend)}
              subtitle="All time"
              icon={<Clock className="size-4" />}
              iconBg="bg-status-follow-up"
              iconColor="text-status-follow-up-foreground"
            />
          </div>

          {/* Single card containing: tabs row + table + pagination */}
          <Card className="overflow-hidden py-0">
            {/* Tabs row with search/filter — all inside the card header area */}
            <CustomerSectionTabs value={section} />

            {/* Table content */}
            <CardContent className="p-0">
              {section === "fuel-cards" && <FuelCardsTable customerId={id} query={query} />}
              {section === "drivers" && <DriversTable customerId={id} query={query} />}
              {section === "transactions" && <TransactionsTable customerId={id} query={query} />}
              {section === "overview" && <OverviewSection />}
            </CardContent>
          </Card>

          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <Card className="py-0">
              <CardHeader className="flex-row items-center justify-between px-4 pt-4">
                <CardTitle className="text-[12px]">Recent Transactions</CardTitle>
                <Link href="/crm/transactions" className="text-[10px] font-medium text-primary hover:underline">View all transactions</Link>
              </CardHeader>
              <CardContent className="px-0 pb-2">
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Card</TableHead><TableHead>Driver</TableHead><TableHead>Description</TableHead><TableHead>Amount</TableHead><TableHead>Location</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {recentTransactions.map((transaction) => {
                      const linkedCard = Array.isArray(transaction.fuel_cards) ? transaction.fuel_cards[0] : transaction.fuel_cards
                      return <TableRow key={transaction.id}>
                        <TableCell><LocalDateTime value={transaction.transaction_date} variant="date" /></TableCell>
                        <TableCell className="font-mono">•••• {linkedCard?.card_last4 ?? "—"}</TableCell>
                        <TableCell className="max-w-28 truncate">{linkedCard?.driver_name ?? "—"}</TableCell>
                        <TableCell>Fuel Purchase</TableCell>
                        <TableCell className="font-semibold tabular-nums">{formatCurrency(Number(transaction.amount ?? 0))}</TableCell>
                        <TableCell>{[transaction.merchant_name, transaction.merchant_state].filter(Boolean).join(", ") || "—"}</TableCell>
                      </TableRow>
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card className="py-0">
              <CardHeader className="flex-row items-center justify-between px-4 pt-4">
                <div>
                  <CardTitle className="text-[12px]">Spend Trend</CardTitle>
                  <p className="mt-2 text-[18px] font-bold tabular-nums">{formatCurrency(monthlySpend)} <span className="ml-2 text-[10px] font-semibold text-status-success-foreground">↑ 12.8%</span></p>
                  <p className="text-[10px] text-muted-foreground">vs previous month</p>
                </div>
                <Badge variant="outline" className="text-[9px]">This Month</Badge>
              </CardHeader>
              <CardContent className="px-3 pb-2"><CustomerSpendTrend data={spendDays} /></CardContent>
            </Card>
          </div>
        </div>

        {/* Right sidebar */}
        <aside className="flex min-w-0 flex-col gap-4">
          {/* Account Health */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Account Health</CardTitle>
                <Badge className="bg-status-success text-status-success-foreground border-none text-[10px]">
                  Healthy
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {/* Credit utilization */}
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Credit Utilization</span>
                  <span className="font-semibold">{creditUtilization}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      creditUtilization > 80 ? "bg-destructive" : creditUtilization > 60 ? "bg-status-follow-up-foreground" : "bg-primary"
                    )}
                    style={{ width: `${Math.min(100, creditUtilization)}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {formatCurrency(currentBalance)} of {formatCurrency(creditLimit)}
                </p>
              </div>
              {/* Status items */}
              <div className="space-y-2 border-t pt-2">
                <HealthItem icon={<CheckCircle2 className="size-3.5 text-status-success-foreground" />} label="Account in good standing" />
                <HealthItem icon={<CheckCircle2 className="size-3.5 text-status-success-foreground" />} label="No payment issues" />
                <HealthItem icon={<CheckCircle2 className="size-3.5 text-status-success-foreground" />} label="Active account" />
              </div>
              <button className="flex w-full items-center justify-between text-xs font-medium text-primary hover:underline">
                View full credit details <span>›</span>
              </button>
            </CardContent>
          </Card>

          {/* Sync Health */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Sync Health</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              <SyncDetailRow label="Last synchronized" value={lastSync} />
              <SyncDetailRow label="Data source" value="WEX Carrier" />
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Status</span>
                <Badge className="bg-status-success text-status-success-foreground border-none text-[10px]">
                  Synced
                </Badge>
              </div>
              <button className="mt-1 flex w-full items-center justify-between text-xs font-medium text-primary hover:underline">
                View sync history <span>›</span>
              </button>
            </CardContent>
          </Card>

          {/* Primary Contact / Manager */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Primary Contact / Manager</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {contactInitials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{contactName}</p>
                  <p className="text-xs text-muted-foreground">Account Manager</p>
                </div>
              </div>
              <div className="space-y-2 border-t pt-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{contactEmail}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Phone className="size-3.5 shrink-0 text-muted-foreground" />
                  <span>{contactPhone}</span>
                </div>
              </div>
              <button className="flex w-full items-center justify-between text-xs font-medium text-primary hover:underline">
                View contact details <span>›</span>
              </button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-[12px] font-semibold">Spend Highlights <span className="font-normal">(This Month)</span></CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3">
              <SpendHighlight label="Total Spend" value={formatCurrency(monthlySpend)} />
              <SpendHighlight label="Avg. Daily Spend" value={formatCurrency(monthlySpend / 30)} />
              <SpendHighlight label="Fuel Transactions" value={(transactionCount ?? 0).toLocaleString()} />
              <Link href="/crm/transactions" className="mt-2 flex items-center justify-between text-[10px] font-medium text-primary hover:underline">View full spending analytics <span>›</span></Link>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}

// ─── Section Tables ──────────────────────────────────────────────────────────

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

  if (!cards?.length) {
    return <div className="p-10 text-center text-sm text-muted-foreground">No fuel cards are linked to this customer.</div>
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Card</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Driver ID</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Policy</TableHead>
              <TableHead>Last Synchronized</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cards.map((card: CardRecord) => (
              <TableRow key={card.id} className="relative cursor-pointer">
                <TableCell>
                  <Link
                    href={`/crm/fuel-cards/${card.id}`}
                    className="font-mono font-medium after:absolute after:inset-0 after:content-[''] hover:underline"
                  >
                    •••• {card.card_last4}
                  </Link>
                </TableCell>
                <TableCell>
                  <FuelCardStatusBadge status={card.status} />
                </TableCell>
                <TableCell className="font-medium">{card.driver_name ?? "—"}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{card.external_driver_id ?? "—"}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{card.unit_number ?? "—"}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{card.policy_number ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  <LocalDateTime value={card.last_synced_at} variant="short" />
                </TableCell>
                <TableCell className="text-right">
                  <button
                    aria-label="Card actions"
                    className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "relative z-10")}
                  >
                    <Ellipsis className="size-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="border-t px-4">
        <TablePagination
          page={page}
          pageSize={pageSize}
          total={count ?? 0}
          itemLabel="cards"
          pageParam="cardsPage"
          pageSizeParam="cardsPageSize"
          searchParams={{ view: "fuel-cards", cardsPageSize: pageSize }}
        />
      </div>
    </>
  )
}

async function DriversTable({ customerId, query }: { customerId: string; query: Record<string, string | undefined> }) {
  const db = await createClient()
  const page = Math.max(1, Number(query.driversPage) || 1)
  const pageSize = getTablePageSize(query.driversPageSize, 25)
  const { data, count, error } = await db
    .from("drivers")
    .select("id,auth_user_id,first_name,last_name,display_name,email,status,onboarding_status,external_driver_id,last_synced_at,fuel_cards(id,status,unit_number,last_synced_at),driver_invitations(status,recipient_email,expires_at,created_at)", { count: "exact" })
    .eq("customer_id", customerId)
    .order("display_name", { ascending: true, nullsFirst: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (error) {
    return <div className="p-10 text-center text-sm text-destructive">Driver profiles could not be loaded.</div>
  }
  if (!data?.length) {
    return <div className="p-10 text-center text-sm text-muted-foreground">No synchronized driver profiles exist for this customer.</div>
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Driver</TableHead>
              <TableHead>Driver ID</TableHead>
              <TableHead>Mobile Access</TableHead>
              <TableHead>Cards</TableHead>
              <TableHead>Active Cards</TableHead>
              <TableHead>Units</TableHead>
              <TableHead>Last Synced</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((driver: any) => {
              const cards = Array.isArray(driver.fuel_cards) ? driver.fuel_cards : []
              const invitations = (Array.isArray(driver.driver_invitations) ? driver.driver_invitations : [])
                .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))
              const latestInvitation = invitations[0]
              const units = Array.from(new Set(cards.map((card: any) => card.unit_number).filter(Boolean)))
              const name = driver.display_name || `${driver.first_name} ${driver.last_name}`.trim() || "Unnamed driver"
              return (
                <TableRow key={driver.id}>
                  <TableCell><p className="font-medium">{name}</p><p className="text-xs text-muted-foreground">{driver.email ?? "No verified email"}</p></TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{driver.external_driver_id ?? "—"}</TableCell>
                  <TableCell><DriverOnboardingBadge status={driver.onboarding_status} /></TableCell>
                  <TableCell className="tabular-nums">{cards.length}</TableCell>
                  <TableCell className="tabular-nums">{cards.filter((card: any) => card.status?.toLowerCase() === "active").length}</TableCell>
                  <TableCell className="text-muted-foreground">{units.join(", ") || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{driver.last_synced_at ? <LocalDateTime value={driver.last_synced_at} /> : "—"}</TableCell>
                  <TableCell className="text-right">
                    <DriverMobileInvitationDialog
                      driverId={driver.id}
                      driverName={name}
                      email={driver.email}
                      authUserLinked={Boolean(driver.auth_user_id)}
                      onboardingStatus={driver.onboarding_status}
                      latestInvitation={latestInvitation ? {
                        status: latestInvitation.status,
                        recipientEmail: latestInvitation.recipient_email,
                        expiresAt: latestInvitation.expires_at,
                      } : null}
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <div className="border-t px-4">
        <TablePagination
          page={page}
          pageSize={pageSize}
          total={count ?? 0}
          itemLabel="drivers"
          pageParam="driversPage"
          pageSizeParam="driversPageSize"
          searchParams={{ view: "drivers", driversPageSize: pageSize }}
        />
      </div>
    </>
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

  if (!transactions?.length) {
    return <div className="p-10 text-center text-sm text-muted-foreground">No synchronized transactions exist for this customer.</div>
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Card</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>WEX ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((transaction: any) => (
              <TableRow key={transaction.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  <LocalDateTime value={transaction.transaction_date} />
                </TableCell>
                <TableCell>
                  {transaction.fuel_cards ? (
                    <Link href={`/crm/fuel-cards/${transaction.fuel_cards.id}`} className="font-mono hover:underline">
                      •••• {transaction.fuel_cards.card_last4}
                    </Link>
                  ) : "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-status-success-foreground shrink-0" />
                    <span>Fuel Purchase</span>
                  </div>
                </TableCell>
                <TableCell className="font-medium tabular-nums">${Number(transaction.amount).toFixed(2)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {[transaction.merchant_name, transaction.merchant_state].filter(Boolean).join(", ") || "—"}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{transaction.provider_transaction_id ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="border-t px-4">
        <TablePagination
          page={page}
          pageSize={pageSize}
          total={count ?? 0}
          itemLabel="transactions"
          pageParam="transactionsPage"
          pageSizeParam="transactionsPageSize"
          searchParams={{ view: "transactions", transactionsPageSize: pageSize }}
        />
      </div>
    </>
  )
}

function OverviewSection() {
  return (
    <div className="flex min-h-[200px] items-center justify-center p-10 text-sm text-muted-foreground">
      Overview analytics coming soon.
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CustomerMetricCard({
  label, value, subtitle, icon, iconBg, iconColor, progressValue,
}: {
  label: string; value: string; subtitle: string; icon: React.ReactNode;
  iconBg: string; iconColor: string; progressValue?: number;
}) {
  return (
    <Card className="min-w-0 py-0 shadow-sm">
      <CardContent className="flex items-start gap-3 p-4">
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg, iconColor)}>
            {icon}
          </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-[18px] font-bold leading-tight tabular-nums">{value}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">{subtitle}</p>
          {progressValue !== undefined && <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${Math.min(100, progressValue)}%` }}
            />
          </div>}
        </div>
      </CardContent>
    </Card>
  )
}

function SpendHighlight({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 text-[11px]">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-semibold tabular-nums">{value}</span>
  </div>
}

function CustomerStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn(
      status === "active" && "border-status-success-foreground/15 bg-status-success text-status-success-foreground",
      ["inactive", "suspended"].includes(status) && "bg-muted text-muted-foreground",
      status === "pending" && "border-status-follow-up-foreground/15 bg-status-follow-up text-status-follow-up-foreground",
    )}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  )
}

function FuelCardStatusBadge({ status }: { status: string }) {
  const normalized = status?.toUpperCase()
  return (
    <Badge variant="outline" className={cn(
      normalized === "ACTIVE" && "border-status-success-foreground/15 bg-status-success text-status-success-foreground font-semibold uppercase tracking-wide text-[10px]",
      normalized === "INACTIVE" && "bg-muted text-muted-foreground uppercase tracking-wide text-[10px]",
      normalized === "SUSPENDED" && "border-destructive/15 bg-destructive/10 text-destructive uppercase tracking-wide text-[10px]",
    )}>
      {normalized || status}
    </Badge>
  )
}

function DriverOnboardingBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn(
      status === "active" && "border-status-success-foreground/15 bg-status-success text-status-success-foreground",
      status === "invited" && "border-status-process-foreground/15 bg-status-process text-status-process-foreground",
      status === "disabled" && "border-destructive/15 bg-destructive/10 text-destructive",
      status === "unclaimed" && "bg-muted text-muted-foreground",
    )}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  )
}

function HealthItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {icon}
      <span className="text-muted-foreground">{label}</span>
    </div>
  )
}

function SyncDetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  )
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value)
}

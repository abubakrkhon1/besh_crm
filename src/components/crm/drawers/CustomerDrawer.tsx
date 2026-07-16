'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, CreditCard, DollarSign, ExternalLink, FileText } from 'lucide-react'
import { EntityDrawer } from '@/components/crm/ui/EntityDrawer'
import { StatusBadge } from '@/components/crm/ui/StatusBadge'
import { ActivityTimeline } from '@/components/crm/ui/ActivityTimeline'
import { CustomerRecord, currency } from '@/lib/mock-data'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'

interface CustomerDrawerProps {
  customer: CustomerRecord | null
  isOpen: boolean
  onClose: () => void
}

const tabs = ['Overview', 'Drivers', 'Fuel Cards', 'Transactions', 'Notes', 'Timeline', 'Documents']

function Stat({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <Card className="rounded-lg py-0">
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-lg font-semibold">{value}</p>
        </div>
        {icon && <div className="rounded-md border bg-background p-2 text-muted-foreground">{icon}</div>}
      </CardContent>
    </Card>
  )
}

export function CustomerDrawer({ customer, isOpen, onClose }: CustomerDrawerProps) {
  const [visibleCustomer, setVisibleCustomer] = useState<CustomerRecord | null>(customer)

  useEffect(() => {
    if (customer) {
      // Preserve drawer content while its close animation finishes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisibleCustomer(customer)
    }
  }, [customer])

  const activeCustomer = customer ?? visibleCustomer

  if (!activeCustomer) return null

  const creditRemaining = activeCustomer.creditLimit - activeCustomer.currentBalance

  return (
    <Tabs defaultValue="Overview" className="w-full">
      <EntityDrawer
        isOpen={isOpen}
        onClose={onClose}
        headerContent={
          <div className="flex w-full flex-col">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <SheetTitle className="truncate text-lg font-semibold">{activeCustomer.company}</SheetTitle>
                <SheetDescription>{activeCustomer.contactName} · {activeCustomer.email}</SheetDescription>
              </div>
              <StatusBadge
                status={activeCustomer.status === 'active' ? 'success' : activeCustomer.status === 'suspended' ? 'danger' : 'pending'}
                label={activeCustomer.status}
              />
            </div>
            <TabsList variant="line" className="mt-5 h-9 w-full justify-start gap-4 overflow-x-auto">
              {tabs.map((tab) => (
                <TabsTrigger key={tab} value={tab} className="flex-none px-3 text-sm focus-visible:border-transparent focus-visible:ring-0">
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        }
        footerContent={
          <Link href={`/crm/customers/${activeCustomer.id}`} className={buttonVariants({ variant: 'outline' })}>
            <ExternalLink className="size-4" />
            Open full profile
          </Link>
        }
      >
        <TabsContent value="Overview" className="mt-0 space-y-4 border-0 outline-none">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Credit Limit" value={currency(activeCustomer.creditLimit)} icon={<DollarSign className="size-4" />} />
            <Stat label="Credit Remaining" value={currency(creditRemaining)} icon={<Activity className="size-4" />} />
            <Stat label="Current Balance" value={currency(activeCustomer.currentBalance)} icon={<DollarSign className="size-4" />} />
            <Stat label="Monthly Spend" value={currency(activeCustomer.monthlySpend)} icon={<Activity className="size-4" />} />
            <Stat label="Lifetime Spend" value={currency(activeCustomer.lifetimeSpend)} icon={<DollarSign className="size-4" />} />
            <Stat label="Fuel Cards" value={activeCustomer.fuelCards.length} icon={<CreditCard className="size-4" />} />
          </div>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Contact Info</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Contact</p>
                <p className="mt-1 text-sm font-medium">{activeCustomer.contactName}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Phone</p>
                <p className="mt-1 text-sm font-medium">{activeCustomer.phone}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs font-medium text-muted-foreground">Address</p>
                <p className="mt-1 text-sm font-medium">{activeCustomer.address}, {activeCustomer.city}, {activeCustomer.state}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="Drivers" className="mt-0 space-y-3 border-0 outline-none">
          {activeCustomer.drivers.map((driver) => (
            <Card key={driver.id} className="rounded-lg py-0">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-medium">{driver.name}</p>
                  <p className="text-sm text-muted-foreground">{driver.homeTerminal} · {driver.phone}</p>
                </div>
                <StatusBadge status={driver.status === 'active' ? 'success' : 'default'} label={driver.status} />
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="Fuel Cards" className="mt-0 space-y-3 border-0 outline-none">
          {activeCustomer.fuelCards.map((card) => (
            <Card key={card.id} className="rounded-lg py-0">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-mono font-medium">•••• {card.last4}</p>
                  <p className="text-sm text-muted-foreground">{card.provider} · {card.driver?.name ?? 'Unassigned'}</p>
                </div>
                <StatusBadge status={card.status === 'active' ? 'success' : card.status === 'frozen' ? 'danger' : 'pending'} label={card.status} />
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="Transactions" className="mt-0 space-y-3 border-0 outline-none">
          {activeCustomer.transactions.map((transaction) => (
            <Card key={transaction.id} className="rounded-lg py-0">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-medium">{transaction.merchant}</p>
                  <p className="text-sm text-muted-foreground">{transaction.city}, {transaction.state} · {transaction.gallons} gal</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{currency(transaction.amount)}</p>
                  <StatusBadge status={transaction.status === 'approved' ? 'success' : transaction.status === 'declined' ? 'danger' : 'pending'} label={transaction.status} />
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="Notes" className="mt-0 space-y-3 border-0 outline-none">
          {activeCustomer.notes.map((note) => (
            <Card key={note.id} className="rounded-lg">
              <CardContent className="space-y-2 p-4">
                <p className="text-sm">{note.body}</p>
                <p className="text-xs text-muted-foreground">{note.author}</p>
              </CardContent>
            </Card>
          ))}
          {activeCustomer.notes.length === 0 && <Empty label="No notes yet" />}
        </TabsContent>

        <TabsContent value="Timeline" className="mt-0 border-0 outline-none">
          <ActivityTimeline events={activeCustomer.activityLogs.map((log) => ({
            id: log.id,
            title: log.title,
            description: log.description,
            date: new Date(log.createdAt).toLocaleDateString(),
            icon: <Activity className="size-4" />,
          }))} />
        </TabsContent>

        <TabsContent value="Documents" className="mt-0 space-y-3 border-0 outline-none">
          {activeCustomer.documents.map((document) => (
            <Card key={document.id} className="rounded-lg py-0">
              <CardContent className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-3">
                  <FileText className="size-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{document.name}</p>
                    <p className="text-sm text-muted-foreground">{document.type}</p>
                  </div>
                </div>
                <Badge variant="outline">{document.status}</Badge>
              </CardContent>
            </Card>
          ))}
          {activeCustomer.documents.length === 0 && <Empty label="No documents uploaded" />}
        </TabsContent>
      </EntityDrawer>
    </Tabs>
  )
}

function Empty({ label }: { label: string }) {
  return (
    <>
      <Separator />
      <div className="py-8 text-center text-sm text-muted-foreground">{label}</div>
    </>
  )
}

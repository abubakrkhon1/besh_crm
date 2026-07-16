'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Activity, ExternalLink, ShieldCheck } from 'lucide-react'
import { EntityDrawer } from '@/components/crm/ui/EntityDrawer'
import { StatusBadge } from '@/components/crm/ui/StatusBadge'
import { ActivityTimeline } from '@/components/crm/ui/ActivityTimeline'
import { FuelCardRecord, currency } from '@/lib/mock-data'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface FuelCardDrawerProps {
  card: FuelCardRecord | null
  isOpen: boolean
  onClose: () => void
}

const tabs = ['Overview', 'Transactions', 'Restrictions', 'Notes', 'History']

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-lg py-0">
      <CardContent className="p-5">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}

export function FuelCardDrawer({ card, isOpen, onClose }: FuelCardDrawerProps) {
  const [visibleCard, setVisibleCard] = useState<FuelCardRecord | null>(card)

  useEffect(() => {
    if (card) {
      // Preserve drawer content while its close animation finishes.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisibleCard(card)
    }
  }, [card])

  const activeCard = card ?? visibleCard

  if (!activeCard) return null

  return (
    <Tabs defaultValue="Overview" className="w-full">
      <EntityDrawer
        isOpen={isOpen}
        onClose={onClose}
        headerContent={
          <div className="flex w-full flex-col">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <SheetTitle className="truncate font-mono text-lg font-semibold">•••• {activeCard.last4}</SheetTitle>
                <SheetDescription>{activeCard.provider} · {activeCard.customer?.company ?? 'Unknown customer'}</SheetDescription>
              </div>
              <StatusBadge status={activeCard.status === 'active' ? 'success' : activeCard.status === 'frozen' ? 'danger' : 'pending'} label={activeCard.status} />
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
          <Link href={`/crm/fuel-cards/${activeCard.id}`} className={buttonVariants({ variant: 'outline' })}>
            <ExternalLink className="size-4" />
            Open card detail
          </Link>
        }
      >
        <TabsContent value="Overview" className="mt-0 space-y-4 border-0 outline-none">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Daily Limit" value={currency(activeCard.dailyLimit)} />
            <Stat label="Monthly Limit" value={currency(activeCard.monthlyLimit)} />
            <Stat label="Gallon Limit" value={`${activeCard.gallonLimit} gal`} />
            <Stat label="Balance" value={currency(activeCard.currentBalance)} />
          </div>
          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle>Assignment</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Field label="Customer" value={activeCard.customer?.company} />
              <Field label="Driver" value={activeCard.driver?.name ?? 'Unassigned'} />
              <Field label="Issued" value={new Date(activeCard.issuedAt).toLocaleDateString()} />
              <Field label="Last transaction" value={activeCard.lastTransactionAt ? new Date(activeCard.lastTransactionAt).toLocaleDateString() : 'None'} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="Transactions" className="mt-0 space-y-3 border-0 outline-none">
          {activeCard.transactions?.map((transaction) => (
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

        <TabsContent value="Restrictions" className="mt-0 border-0 outline-none">
          <Restrictions card={activeCard} />
        </TabsContent>

        <TabsContent value="Notes" className="mt-0 space-y-3 border-0 outline-none">
          {activeCard.notes?.map((note) => (
            <Card key={note.id} className="rounded-lg">
              <CardContent className="space-y-2 p-4">
                <p className="text-sm">{note.body}</p>
                <p className="text-xs text-muted-foreground">{note.author}</p>
              </CardContent>
            </Card>
          ))}
          {!activeCard.notes?.length && <Empty label="No notes yet" />}
        </TabsContent>

        <TabsContent value="History" className="mt-0 border-0 outline-none">
          <ActivityTimeline events={(activeCard.activityLogs ?? []).map((log) => ({
            id: log.id,
            title: log.title,
            description: log.description,
            date: new Date(log.createdAt).toLocaleDateString(),
            icon: <Activity className="size-4" />,
          }))} />
        </TabsContent>
      </EntityDrawer>
    </Tabs>
  )
}

function Restrictions({ card }: { card: FuelCardRecord }) {
  const restriction = card.restriction
  if (!restriction) return <Empty label="No restrictions configured" />

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" />
          Restrictions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <BadgeRow label="Allowed states" values={restriction.allowedStates} />
        <BadgeRow label="Blocked states" values={restriction.blockedStates} variant="destructive" />
        <BadgeRow label="Allowed merchants" values={restriction.allowedMerchants} />
        <BadgeRow label="Blocked merchants" values={restriction.blockedMerchants} variant="destructive" />
        <Separator />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Toggle label="Fuel only" enabled={restriction.fuelOnly} />
          <Toggle label="DEF allowed" enabled={restriction.defAllowed} />
          <Toggle label="Maintenance allowed" enabled={restriction.maintenanceAllowed} />
          <Field label="Time window" value={restriction.timeWindow} />
        </div>
      </CardContent>
    </Card>
  )
}

function BadgeRow({ label, values, variant = 'outline' }: { label: string; values: string[]; variant?: 'outline' | 'destructive' }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {values.length ? values.map((value) => <Badge key={value} variant={variant}>{value}</Badge>) : <span className="text-sm text-muted-foreground">None</span>}
      </div>
    </div>
  )
}

function Toggle({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-background p-3">
      <span>{label}</span>
      <StatusBadge status={enabled ? 'success' : 'default'} label={enabled ? 'Yes' : 'No'} />
    </div>
  )
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium">{value || 'Not provided'}</p>
    </div>
  )
}

function Empty({ label }: { label: string }) {
  return <div className="py-8 text-center text-sm text-muted-foreground">{label}</div>
}

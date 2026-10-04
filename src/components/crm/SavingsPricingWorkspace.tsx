'use client'

import { useState, useTransition } from 'react'
import { Building2, CalendarClock, CircleDollarSign, Clock3, Pencil, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { setStationSavingsPrice, type StationSavingsPriceWithEditor } from '@/app/actions/savings-pricing'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { LocalDateTime } from '@/components/ui/local-date-time'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { StationBrand } from '@/types/database.types'

type StationPrice = {
  id: StationBrand
  name: string
  pumpPrice: number | null
  wexPrice: number | null
  customerPrice: number | null
  customerSavings: number | null
  grossProfit: number | null
  effectiveDate: string | null
  updatedAt: string | null
  updatedBy: string | null
  updatedToday: boolean
}

const STATIONS: Array<{ id: StationBrand; name: string }> = [
  { id: 'loves', name: "Love's" },
  { id: 'pilot', name: 'Pilot' },
  { id: 'flying_j', name: 'Flying J' },
]

const STATION_NAMES: Record<StationBrand, string> = Object.fromEntries(STATIONS.map((station) => [station.id, station.name])) as Record<StationBrand, string>

function localDateInputValue() {
  const date = new Date()
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

function formatPrice(price: number | null) {
  return price == null
    ? 'Not set'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(price)
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}

export function SavingsPricingWorkspace({ initialPrices, loadError }: { initialPrices: StationSavingsPriceWithEditor[]; loadError: string | null }) {
  const [prices, setPrices] = useState(initialPrices)
  const [dataError, setDataError] = useState(loadError)
  const [selectedId, setSelectedId] = useState<StationBrand | null>(null)
  const [pumpPriceInput, setPumpPriceInput] = useState('')
  const [wexPriceInput, setWexPriceInput] = useState('')
  const [customerPriceInput, setCustomerPriceInput] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const today = localDateInputValue()
  const stations = STATIONS.map((station): StationPrice => {
    const current = prices.find((price) => price.station_brand === station.id
      && price.effective_from <= today
      && (!price.effective_until || price.effective_until >= today))
    return {
      ...station,
      pumpPrice: current?.pump_price_per_gallon ?? null,
      wexPrice: current?.wex_price_per_gallon ?? null,
      customerPrice: current?.our_price_per_gallon ?? null,
      customerSavings: current?.customer_savings_per_gallon ?? null,
      grossProfit: current?.gross_profit_per_gallon ?? null,
      effectiveDate: current?.effective_from ?? null,
      updatedAt: current?.updated_at ?? null,
      updatedBy: current?.editor_name ?? null,
      updatedToday: current?.effective_from === today && current.pump_price_per_gallon != null && current.wex_price_per_gallon != null,
    }
  })
  const selectedStation = stations.find((station) => station.id === selectedId) ?? null
  const configuredCount = stations.filter((station) => station.pumpPrice != null && station.wexPrice != null && station.customerPrice != null).length
  const updatedTodayCount = stations.filter((station) => station.updatedToday).length
  const pendingCount = stations.length - updatedTodayCount
  const completion = Math.round((updatedTodayCount / stations.length) * 100)

  function openEditor(station: StationPrice) {
    setSelectedId(station.id)
    setPumpPriceInput(station.pumpPrice?.toFixed(3) ?? '')
    setWexPriceInput(station.wexPrice?.toFixed(3) ?? '')
    setCustomerPriceInput(station.customerPrice?.toFixed(3) ?? '')
    setEffectiveDate(station.effectiveDate ?? localDateInputValue())
    setNote('')
    setError(null)
  }

  function closeEditor() {
    setSelectedId(null)
    setError(null)
  }

  function savePrice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedStation) return

    const pumpPrice = Number(pumpPriceInput)
    const wexPrice = Number(wexPriceInput)
    const customerPrice = Number(customerPriceInput)
    if ([pumpPrice, wexPrice, customerPrice].some((price) => !Number.isFinite(price) || price <= 0 || price > 20)) {
      setError('Enter valid pump, WEX, and customer prices between $0 and $20 per gallon.')
      return
    }
    if (wexPrice > customerPrice) {
      setError('Customer price must be at least the WEX price so BESH does not sell at a loss.')
      return
    }
    if (customerPrice > pumpPrice) {
      setError('Customer price cannot be higher than the pump price.')
      return
    }
    if (!effectiveDate) {
      setError('Choose the date this price becomes effective.')
      return
    }

    startTransition(async () => {
      const result = await setStationSavingsPrice({
        stationBrand: selectedStation.id,
        pumpPrice: pumpPriceInput,
        wexPrice: wexPriceInput,
        customerPrice: customerPriceInput,
        effectiveDate,
        note,
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      if (result.prices) setPrices(result.prices)
      setDataError(null)
      toast.success(`${selectedStation.name} price saved.`)
      closeEditor()
    })
  }

  return (
    <div className="flex animate-fade-in flex-col gap-5 pb-12">
      <header className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <Tags className="size-5 text-muted-foreground" aria-hidden="true" />
            <Badge variant="secondary">Daily pricing</Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Savings pricing</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Set the pump price, WEX cost, and customer price for each supported station brand.
          </p>
        </div>
      </header>

      <Alert variant={dataError ? 'destructive' : 'default'}>
        <CalendarClock aria-hidden="true" />
        <AlertTitle>{dataError ? 'Pricing data unavailable' : 'Daily pricing workflow'}</AlertTitle>
        <AlertDescription>
          {dataError ?? 'Set or confirm each station price for today. Saving the same station and effective date updates that daily record; prior dates remain in history.'}
        </AlertDescription>
      </Alert>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Daily pricing summary">
        <SummaryCard title="Prices configured" value={`${configuredCount} of ${stations.length}`} description="Station brands with a price" icon={<CircleDollarSign />} />
        <SummaryCard title="Updated today" value={`${updatedTodayCount} of ${stations.length}`} description={`${completion}% of today's updates complete`} icon={<Clock3 />} />
        <SummaryCard title="Still needs review" value={String(pendingCount)} description="Update or confirm before publishing" icon={<Building2 />} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3" aria-label="Station prices">
        {stations.map((station) => (
          <Card key={station.id}>
            <CardHeader>
              <CardTitle>{station.name}</CardTitle>
              <CardDescription>Global mobile price</CardDescription>
              <CardAction>
                <Badge variant={station.updatedToday ? 'default' : 'outline'}>
                  {station.updatedToday ? 'Updated today' : 'Needs update'}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer price</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">{formatPrice(station.customerPrice)}</p>
                <p className="mt-1 text-xs text-muted-foreground">per gallon</p>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <PriceDetail label="Pump price" value={formatPrice(station.pumpPrice)} />
                <PriceDetail label="WEX cost" value={formatPrice(station.wexPrice)} />
                <PriceDetail label="Customer saves" value={formatPerGallon(station.customerSavings)} />
                <PriceDetail label="BESH gross profit" value={formatPerGallon(station.grossProfit)} />
                <div>
                  <dt className="text-muted-foreground">Effective</dt>
                  <dd className="mt-1 font-medium">{formatDate(station.effectiveDate)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Updated by</dt>
                  <dd className="mt-1 truncate font-medium">{station.updatedBy ?? '—'}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Last updated</dt>
                  <dd className="mt-1 font-medium">{station.updatedAt ? <LocalDateTime value={station.updatedAt} /> : '—'}</dd>
                </div>
              </dl>
            </CardContent>
            <CardFooter className="justify-end">
              <Button type="button" variant={station.customerPrice == null ? 'default' : 'outline'} onClick={() => openEditor(station)}>
                <Pencil data-icon="inline-start" />
                {station.customerPrice == null ? 'Set pricing' : 'Update pricing'}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Price update history</CardTitle>
          <CardDescription>Effective-dated prices saved for all supported station brands.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Station</TableHead>
                <TableHead>Pump</TableHead>
                <TableHead>WEX cost</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Customer saves</TableHead>
                <TableHead>Gross profit</TableHead>
                <TableHead>Effective date</TableHead>
                <TableHead>Updated at</TableHead>
                <TableHead>Updated by</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prices.length ? prices.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="pl-5 font-medium">{STATION_NAMES[item.station_brand]}</TableCell>
                  <TableCell className="tabular-nums">{formatPrice(item.pump_price_per_gallon)}</TableCell>
                  <TableCell className="tabular-nums">{formatPrice(item.wex_price_per_gallon)}</TableCell>
                  <TableCell className="font-semibold tabular-nums">{formatPrice(item.our_price_per_gallon)}</TableCell>
                  <TableCell className="tabular-nums">{formatPerGallon(item.customer_savings_per_gallon)}</TableCell>
                  <TableCell className="tabular-nums">{formatPerGallon(item.gross_profit_per_gallon)}</TableCell>
                  <TableCell>{formatDate(item.effective_from)}</TableCell>
                  <TableCell><LocalDateTime value={item.updated_at} /></TableCell>
                  <TableCell>{item.editor_name}</TableCell>
                  <TableCell className="max-w-72 truncate text-muted-foreground">{item.change_reason || '—'}</TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={10} className="h-28 text-center text-muted-foreground">No station prices have been saved yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={selectedId != null} onOpenChange={(open) => { if (!open) closeEditor() }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-md">
          <form onSubmit={savePrice} className="flex max-h-[calc(100dvh-4rem)] min-h-0 flex-col">
            <DialogHeader className="shrink-0">
              <DialogTitle>{selectedStation ? `Update ${selectedStation.name} price` : 'Update station price'}</DialogTitle>
              <DialogDescription>Enter today&apos;s pump price, the WEX discounted cost, and the price shown to customers.</DialogDescription>
            </DialogHeader>
            <FieldGroup className="min-h-0 overflow-y-auto py-5 pr-1">
              <Field>
                <FieldLabel htmlFor="pump-price">Pump price per gallon</FieldLabel>
                <Input
                  id="pump-price"
                  type="number"
                  inputMode="decimal"
                  min="0.001"
                  max="20"
                  step="0.001"
                  placeholder="4.500"
                  value={pumpPriceInput}
                  onChange={(event) => { setPumpPriceInput(event.target.value); setError(null) }}
                  autoFocus
                />
                <FieldDescription>The public price displayed at the station.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="wex-price">WEX discounted price per gallon</FieldLabel>
                <Input id="wex-price" type="number" inputMode="decimal" min="0.001" max="20" step="0.001" placeholder="4.000" value={wexPriceInput} onChange={(event) => { setWexPriceInput(event.target.value); setError(null) }} />
                <FieldDescription>The amount BESH pays through WEX.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="customer-price">Customer price per gallon</FieldLabel>
                <Input id="customer-price" type="number" inputMode="decimal" min="0.001" max="20" step="0.001" placeholder="4.200" value={customerPriceInput} onChange={(event) => { setCustomerPriceInput(event.target.value); setError(null) }} />
                <FieldDescription>The discounted price displayed in the mobile app.</FieldDescription>
              </Field>
              <PricingPreview pumpPrice={pumpPriceInput} wexPrice={wexPriceInput} customerPrice={customerPriceInput} />
              <Field data-invalid={Boolean(error && !effectiveDate)}>
                <FieldLabel htmlFor="effective-date">Effective date</FieldLabel>
                <Input id="effective-date" type="date" value={effectiveDate} onChange={(event) => { setEffectiveDate(event.target.value); setError(null) }} aria-invalid={Boolean(error && !effectiveDate)} />
                <FieldDescription>The mobile app will use this date when pricing is connected.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="price-note">Internal note</FieldLabel>
                <Input id="price-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={160} placeholder="Optional reason for this change" />
              </Field>
              {error && <FieldError>{error}</FieldError>}
            </FieldGroup>
            <DialogFooter className="shrink-0">
              <Button type="button" variant="outline" onClick={closeEditor} disabled={pending}>Cancel</Button>
              <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save price'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function formatDifference(high: number | null, low: number | null) {
  if (high == null || low == null) return '—'
  return formatPerGallon(high - low)
}

function formatPerGallon(value: number | null) {
  if (value == null) return '—'
  return `${formatPrice(value)}/gal`
}

function PriceDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function PricingPreview({ pumpPrice, wexPrice, customerPrice }: { pumpPrice: string; wexPrice: string; customerPrice: string }) {
  const pump = Number(pumpPrice)
  const wex = Number(wexPrice)
  const customer = Number(customerPrice)
  const hasValidOrder = pump > 0 && wex > 0 && customer >= wex && customer <= pump

  return (
    <Alert>
      <CircleDollarSign aria-hidden="true" />
      <AlertTitle>Price breakdown</AlertTitle>
      <AlertDescription>
        {hasValidOrder ? (
          <dl className="mt-2 grid grid-cols-2 gap-3">
            <PriceDetail label="Customer saves" value={formatDifference(pump, customer)} />
            <PriceDetail label="BESH gross profit" value={formatDifference(customer, wex)} />
          </dl>
        ) : 'Enter prices in this order: WEX cost ≤ customer price ≤ pump price.'}
      </AlertDescription>
    </Alert>
  )
}

function SummaryCard({ title, value, description, icon }: { title: string; value: string; description: string; icon: React.ReactNode }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardAction><span className="text-muted-foreground">{icon}</span></CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

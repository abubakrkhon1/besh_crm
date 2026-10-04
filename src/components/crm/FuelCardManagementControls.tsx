'use client'

import { useState, useTransition } from 'react'
import { CreditCard, Gauge, KeyRound, LoaderCircle, RefreshCcw, Snowflake, Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { changeFuelCardPin, changeFuelCardStatus, issueFuelCard, loadWexCardOrderOptions, removeFuelCard, replaceFuelCard, setFuelCardLimits } from '@/app/actions/card-management'
import type { WexAllowedOrderType } from '@/lib/integrations/wex/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet, FieldLegend } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

type CustomerOption = { id: string; name: string }

function nullableWholeNumber(value: FormDataEntryValue | null) {
  const text = String(value ?? '').trim()
  return text ? Number(text) : null
}

export function FuelCardStatusControl({ cardId, status }: { cardId: string; status: string }) {
  const normalized = status.trim().toUpperCase()
  const action = normalized === 'INACTIVE' ? 'unfreeze' : 'freeze'
  const supported = normalized === 'ACTIVE' || normalized === 'INACTIVE'
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const result = await changeFuelCardStatus({ fuelCardId: cardId, action, idempotencyKey: crypto.randomUUID() })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(result.message)
      setOpen(false)
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button type="button" variant="outline" size="lg" disabled={!supported} title={supported ? undefined : 'Only active or inactive WEX cards can use this action.'} />}>
        <Snowflake data-icon="inline-start" />
        {action === 'unfreeze' ? 'Unfreeze card' : 'Freeze card'}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia><Snowflake /></AlertDialogMedia>
          <AlertDialogTitle>{action === 'freeze' ? 'Freeze this card?' : 'Reactivate this card?'}</AlertDialogTitle>
          <AlertDialogDescription>
            {action === 'freeze'
              ? 'WEX will mark the card inactive and new purchases should be declined until it is reactivated.'
              : 'WEX will mark the card active again, allowing purchases under its current policy.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction type="button" variant={action === 'freeze' ? 'destructive' : 'default'} disabled={pending} onClick={submit}>
            {pending && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
            {pending ? 'Updating WEX…' : action === 'freeze' ? 'Freeze card' : 'Reactivate card'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function FuelCardLimitsDialog({
  cardId,
  current,
}: {
  cardId: string
  current: {
    dailyAmount: number | null
    weeklyAmount: number | null
    monthlyAmount: number | null
    dailyTransactions: number | null
    weeklyTransactions: number | null
    monthlyTransactions: number | null
  }
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    const form = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await setFuelCardLimits({
        fuelCardId: cardId, idempotencyKey: crypto.randomUUID(),
        dailyAmount: nullableWholeNumber(form.get('dailyAmount')),
        weeklyAmount: nullableWholeNumber(form.get('weeklyAmount')),
        monthlyAmount: nullableWholeNumber(form.get('monthlyAmount')),
        dailyTransactions: nullableWholeNumber(form.get('dailyTransactions')),
        weeklyTransactions: nullableWholeNumber(form.get('weeklyTransactions')),
        monthlyTransactions: nullableWholeNumber(form.get('monthlyTransactions')),
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      toast.success(result.message)
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(undefined) }}>
      <DialogTrigger render={<Button type="button" variant="outline" size="lg" />}>
        <Gauge data-icon="inline-start" />
        Edit limits
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-lg">
        <form onSubmit={submit} className="flex max-h-[calc(100dvh-4rem)] min-h-0 flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Set card spending limits</DialogTitle>
            <DialogDescription>These limits are sent to WEX and saved locally only after WEX confirms them.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="min-h-0 overflow-y-auto py-5 pr-1">
            <Alert>
              <TriangleAlert />
              <AlertTitle>WEX account capability required</AlertTitle>
              <AlertDescription>The current WEX contract must have Refreshing Limits / Velocity Limits enabled. If it is not enabled, this request will make no local changes.</AlertDescription>
            </Alert>
            <FieldSet>
              <FieldLegend>Dollar limits</FieldLegend>
              <div className="grid gap-4 sm:grid-cols-3">
                <LimitField name="dailyAmount" label="Daily" value={current.dailyAmount} prefix="$" />
                <LimitField name="weeklyAmount" label="Weekly" value={current.weeklyAmount} prefix="$" />
                <LimitField name="monthlyAmount" label="Monthly" value={current.monthlyAmount} prefix="$" />
              </div>
            </FieldSet>
            <FieldSet>
              <FieldLegend>Transaction-count limits</FieldLegend>
              <div className="grid gap-4 sm:grid-cols-3">
                <LimitField name="dailyTransactions" label="Daily" value={current.dailyTransactions} />
                <LimitField name="weeklyTransactions" label="Weekly" value={current.weeklyTransactions} />
                <LimitField name="monthlyTransactions" label="Monthly" value={current.monthlyTransactions} />
              </div>
            </FieldSet>
            <FieldDescription>Leave a field blank to send no explicit value for that period. Amounts must be whole dollars because this WEX interface accepts integers.</FieldDescription>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
              {pending ? 'Checking with WEX…' : 'Save limits'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function LimitField({ name, label, value, prefix }: { name: string; label: string; value: number | null; prefix?: string }) {
  return (
    <Field>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{prefix}</span>}
        <Input id={name} name={name} type="number" inputMode="numeric" min="0" max="1000000" step="1" defaultValue={value ?? ''} className={prefix ? 'pl-7' : undefined} />
      </div>
    </Field>
  )
}

export function ReplaceFuelCardDialog({ cardId, cardLast4 }: { cardId: string; cardLast4: string | null }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setError(undefined)
    startTransition(async () => {
      const result = await replaceFuelCard({
        fuelCardId: String(form.get('fuelCardId')), idempotencyKey: crypto.randomUUID(),
        replacementType: String(form.get('replacementType')),
        shipToFirst: String(form.get('shipToFirst') ?? ''), shipToLast: String(form.get('shipToLast') ?? ''),
        shipToAddress1: String(form.get('shipToAddress1') ?? ''), shipToAddress2: String(form.get('shipToAddress2') ?? ''),
        shipToCity: String(form.get('shipToCity') ?? ''), shipToState: String(form.get('shipToState') ?? ''),
        shipToZip: String(form.get('shipToZip') ?? ''), shippingMethod: Number(form.get('shippingMethod')),
        rushProcessing: form.get('rushProcessing') === 'on', reason: String(form.get('reason') ?? ''),
      })
      if (!result.ok) return setError(result.message)
      toast.success(result.message)
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setError(undefined) }}>
      <DialogTrigger render={<Button type="button" variant="outline" size="lg" />}>
        <RefreshCcw data-icon="inline-start" />Replace card
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-xl">
        <form onSubmit={submit} className="flex max-h-[calc(100dvh-4rem)] min-h-0 flex-col">
          <input type="hidden" name="fuelCardId" value={cardId} />
          <DialogHeader className="shrink-0">
            <DialogTitle>Replace card ending {cardLast4 ?? 'unknown'}</DialogTitle>
            <DialogDescription>Submit a lost, stolen, or damaged-card request directly to WEX. This action may deactivate or supersede the existing card.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="min-h-0 overflow-y-auto py-5 pr-1">
            <Alert><TriangleAlert /><AlertTitle>Provider action</AlertTitle><AlertDescription>After submission, do not repeat this request unless its audit record shows that WEX rejected it.</AlertDescription></Alert>
            <Field><FieldLabel htmlFor="replacementType">Reason category</FieldLabel><NativeSelect id="replacementType" name="replacementType" className="w-full" required><NativeSelectOption value="lost">Lost card</NativeSelectOption><NativeSelectOption value="stolen">Stolen card</NativeSelectOption><NativeSelectOption value="damaged">Damaged card</NativeSelectOption></NativeSelect></Field>
            <Field><FieldLabel htmlFor="reason">Replacement note</FieldLabel><Input id="reason" name="reason" maxLength={100} placeholder="Lost by driver, damaged magnetic stripe…" required /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field><FieldLabel htmlFor="replacementShipToFirst">Recipient first name</FieldLabel><Input id="replacementShipToFirst" name="shipToFirst" maxLength={50} required /></Field>
              <Field><FieldLabel htmlFor="replacementShipToLast">Recipient last name</FieldLabel><Input id="replacementShipToLast" name="shipToLast" maxLength={50} required /></Field>
            </div>
            <Field><FieldLabel htmlFor="replacementAddress1">Shipping address</FieldLabel><Input id="replacementAddress1" name="shipToAddress1" autoComplete="shipping street-address" maxLength={100} required /></Field>
            <Field><FieldLabel htmlFor="replacementAddress2">Address line 2</FieldLabel><Input id="replacementAddress2" name="shipToAddress2" maxLength={100} /></Field>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_5rem_7rem]">
              <Field><FieldLabel htmlFor="replacementCity">City</FieldLabel><Input id="replacementCity" name="shipToCity" maxLength={50} required /></Field>
              <Field><FieldLabel htmlFor="replacementState">State</FieldLabel><Input id="replacementState" name="shipToState" maxLength={2} required /></Field>
              <Field><FieldLabel htmlFor="replacementZip">ZIP</FieldLabel><Input id="replacementZip" name="shipToZip" maxLength={10} required /></Field>
            </div>
            <Field><FieldLabel htmlFor="replacementShippingMethod">WEX shipping-method code</FieldLabel><Input id="replacementShippingMethod" name="shippingMethod" type="number" min="0" max="99" defaultValue="1" required /></Field>
            <Field orientation="horizontal"><input id="replacementRush" name="rushProcessing" type="checkbox" className="size-4" /><FieldLabel htmlFor="replacementRush">Request rush processing</FieldLabel></Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter className="shrink-0"><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={pending}>{pending && <LoaderCircle data-icon="inline-start" className="animate-spin" />}{pending ? 'Submitting once…' : 'Submit replacement'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function CardSecurityActions({ cardId }: { cardId: string }) {
  const [pinOpen, setPinOpen] = useState(false); const [removeOpen, setRemoveOpen] = useState(false)
  const [error, setError] = useState<string>(); const [pending, startTransition] = useTransition()
  function pinSubmit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const pin = String(new FormData(event.currentTarget).get('pin') ?? ''); startTransition(async () => { const result = await changeFuelCardPin({ fuelCardId: cardId, pin, idempotencyKey: crypto.randomUUID() }); if (!result.ok) return setError(result.message); toast.success(result.message); setPinOpen(false) }) }
  function removeSubmit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const confirmation = String(new FormData(event.currentTarget).get('confirmation') ?? ''); startTransition(async () => { const result = await removeFuelCard({ fuelCardId: cardId, confirmation, idempotencyKey: crypto.randomUUID() }); if (!result.ok) return setError(result.message); toast.success(result.message); setRemoveOpen(false) }) }
  return <>
    <Dialog open={pinOpen} onOpenChange={(v) => { setPinOpen(v); setError(undefined) }}><DialogTrigger render={<Button type="button" variant="outline" size="lg" />}><KeyRound data-icon="inline-start" />Change PIN</DialogTrigger><DialogContent><form onSubmit={pinSubmit}><DialogHeader><DialogTitle>Change card PIN</DialogTitle><DialogDescription>The PIN is sent directly to WEX and is never stored or logged by the CRM.</DialogDescription></DialogHeader><FieldGroup className="py-5"><Field><FieldLabel htmlFor="newCardPin">New PIN</FieldLabel><Input id="newCardPin" name="pin" type="password" inputMode="numeric" pattern="[0-9]{4,12}" minLength={4} maxLength={12} autoComplete="new-password" required /></Field>{error && <FieldError>{error}</FieldError>}</FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={() => setPinOpen(false)}>Cancel</Button><Button type="submit" disabled={pending}>Change PIN</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={removeOpen} onOpenChange={(v) => { setRemoveOpen(v); setError(undefined) }}><DialogTrigger render={<Button type="button" variant="destructive" size="lg" />}><Trash2 data-icon="inline-start" />Remove card</DialogTrigger><DialogContent><form onSubmit={removeSubmit}><DialogHeader><DialogTitle>Remove this card from WEX?</DialogTitle><DialogDescription>This provider action may be permanent. Type REMOVE to confirm.</DialogDescription></DialogHeader><FieldGroup className="py-5"><Field><FieldLabel htmlFor="removeConfirmation">Confirmation</FieldLabel><Input id="removeConfirmation" name="confirmation" autoComplete="off" required /></Field>{error && <FieldError>{error}</FieldError>}</FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={() => setRemoveOpen(false)}>Cancel</Button><Button type="submit" variant="destructive" disabled={pending}>Remove permanently</Button></DialogFooter></form></DialogContent></Dialog>
  </>
}

export function IssueFuelCardDialog({ customers }: { customers: CustomerOption[] }) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<WexAllowedOrderType[] | null>(null)
  const [selectedOrderType, setSelectedOrderType] = useState('')
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) return
    setError(undefined)
    setOptions(null)
    startTransition(async () => {
      const result = await loadWexCardOrderOptions()
      setOptions(result.options)
      if (!result.ok) setError(result.message)
      if (result.options[0]) setSelectedOrderType(String(result.options[0].orderType))
    })
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const selected = options?.find((option) => option.orderType === Number(selectedOrderType))
    if (!selected) return setError('Choose a WEX card-order type.')
    setError(undefined)
    startTransition(async () => {
      const customerId = String(form.get('customerId') ?? '')
      const result = await issueFuelCard({
        idempotencyKey: crypto.randomUUID(), customerId: customerId || null,
        orderType: selected.orderType, policyNumber: selected.defaultPolicy, cardStyle: selected.defaultCardStyle,
        embossedName: String(form.get('embossedName') ?? ''), shipToFirst: String(form.get('shipToFirst') ?? ''),
        shipToLast: String(form.get('shipToLast') ?? ''), shipToAddress1: String(form.get('shipToAddress1') ?? ''),
        shipToAddress2: String(form.get('shipToAddress2') ?? ''), shipToCity: String(form.get('shipToCity') ?? ''),
        shipToState: String(form.get('shipToState') ?? ''), shipToZip: String(form.get('shipToZip') ?? ''),
        shippingMethod: Number(form.get('shippingMethod')), rushProcessing: form.get('rushProcessing') === 'on',
        cardCarrier: String(form.get('cardCarrier') ?? ''),
      })
      if (!result.ok) return setError(result.message)
      toast.success(result.message)
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="lg" />}>
        <CreditCard data-icon="inline-start" />
        Issue card
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-hidden sm:max-w-xl">
        <form onSubmit={submit} className="flex max-h-[calc(100dvh-4rem)] min-h-0 flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle>Issue a new WEX card</DialogTitle>
            <DialogDescription>Submit one physical-card order. Duplicate submissions are blocked by a unique request identifier.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="min-h-0 overflow-y-auto py-5 pr-1">
            {pending && options == null && <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="animate-spin" />Loading WEX order options…</p>}
            {error && <Alert variant="destructive"><TriangleAlert /><AlertTitle>Card order unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
            {options?.length ? <>
              <Field>
                <FieldLabel htmlFor="orderType">WEX order type</FieldLabel>
                <NativeSelect id="orderType" className="w-full" value={selectedOrderType} onChange={(event) => setSelectedOrderType(event.target.value)}>
                  {options.map((option) => <NativeSelectOption key={`${option.orderType}-${option.defaultPolicy}-${option.defaultCardStyle}`} value={option.orderType}>{option.orderDescription} · Policy {option.defaultPolicy} · {option.defaultCardStyleDescription}</NativeSelectOption>)}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor="customerId">CRM customer</FieldLabel>
                <NativeSelect id="customerId" name="customerId" className="w-full"><NativeSelectOption value="">Assign after delivery</NativeSelectOption>{customers.map((customer) => <NativeSelectOption key={customer.id} value={customer.id}>{customer.name}</NativeSelectOption>)}</NativeSelect>
                <FieldDescription>This records the intended customer in the audit trail; WEX remains the source of the new card record.</FieldDescription>
              </Field>
              <Field><FieldLabel htmlFor="embossedName">Name printed on card</FieldLabel><Input id="embossedName" name="embossedName" maxLength={26} required /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field><FieldLabel htmlFor="shipToFirst">Recipient first name</FieldLabel><Input id="shipToFirst" name="shipToFirst" maxLength={50} required /></Field>
                <Field><FieldLabel htmlFor="shipToLast">Recipient last name</FieldLabel><Input id="shipToLast" name="shipToLast" maxLength={50} required /></Field>
              </div>
              <Field><FieldLabel htmlFor="shipToAddress1">Shipping address</FieldLabel><Input id="shipToAddress1" name="shipToAddress1" autoComplete="shipping street-address" maxLength={100} required /></Field>
              <Field><FieldLabel htmlFor="shipToAddress2">Address line 2</FieldLabel><Input id="shipToAddress2" name="shipToAddress2" maxLength={100} /></Field>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_5rem_7rem]">
                <Field><FieldLabel htmlFor="shipToCity">City</FieldLabel><Input id="shipToCity" name="shipToCity" maxLength={50} required /></Field>
                <Field><FieldLabel htmlFor="shipToState">State</FieldLabel><Input id="shipToState" name="shipToState" maxLength={2} required /></Field>
                <Field><FieldLabel htmlFor="shipToZip">ZIP</FieldLabel><Input id="shipToZip" name="shipToZip" inputMode="numeric" maxLength={10} required /></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field><FieldLabel htmlFor="shippingMethod">WEX shipping-method code</FieldLabel><Input id="shippingMethod" name="shippingMethod" type="number" min="0" max="99" step="1" defaultValue="1" required /></Field>
                <Field><FieldLabel htmlFor="cardCarrier">WEX card-carrier code</FieldLabel><Input id="cardCarrier" name="cardCarrier" maxLength={50} /></Field>
              </div>
              <Field orientation="horizontal"><input id="rushProcessing" name="rushProcessing" type="checkbox" className="size-4" /><FieldLabel htmlFor="rushProcessing">Request rush processing</FieldLabel></Field>
            </> : null}
          </FieldGroup>
          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending || !options?.length}>
              {pending && options != null && <LoaderCircle data-icon="inline-start" className="animate-spin" />}
              {pending && options != null ? 'Submitting once…' : 'Submit card order'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

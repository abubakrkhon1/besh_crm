'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Check, ChevronsUpDown, Loader2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type FilterOption = { value: string; label: string }

type TransactionFiltersProps = {
  statuses: string[]
  customers: FilterOption[]
  cards: FilterOption[]
  fuelTypes: string[]
}

export function TransactionFilters({ statuses, customers, cards, fuelTypes }: TransactionFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    router.replace(`${pathname}?${next}`)
  }

  useEffect(() => {
    const timer = window.setTimeout(() => update('q', query.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  const clearFilters = () => {
    setQuery('')
    const next = new URLSearchParams(params)
    ;['q', 'status', 'customer', 'card', 'fuelType', 'page'].forEach((key) => next.delete(key))
    router.replace(`${pathname}?${next}`)
  }

  const hasFilters = Boolean(query || params.get('status') || params.get('customer') || params.get('card') || params.get('fuelType'))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search transactions</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search merchant, driver, card, customer or transaction ID…" />
        </label>
        <Button type="button" variant="outline" size="lg" onClick={clearFilters} disabled={!hasFilters}>
          <X data-icon="inline-start" />
          Clear filters
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <FilterSelect label="Status" value={params.get('status') ?? ''} onChange={(value) => update('status', value)} options={statuses.map((status) => ({ value: status, label: formatLabel(status) }))} allLabel="All statuses" />
        <LookupFilter label="Customer" type="customer" value={params.get('customer') ?? ''} selectedOptions={customers} onChange={(value) => update('customer', value)} allLabel="All customers" />
        <LookupFilter label="Card" type="card" value={params.get('card') ?? ''} selectedOptions={cards} onChange={(value) => update('card', value)} allLabel="All cards" />
        <FilterSelect label="Fuel type" value={params.get('fuelType') ?? ''} onChange={(value) => update('fuelType', value)} options={fuelTypes.map((type) => ({ value: type, label: formatLabel(type) }))} allLabel="All fuel types" />
      </div>
    </div>
  )
}

function LookupFilter({ label, type, value, selectedOptions, onChange, allLabel }: {
  label: string
  type: 'customer' | 'card'
  value: string
  selectedOptions: FilterOption[]
  onChange: (value: string) => void
  allLabel: string
}) {
  const [search, setSearch] = useState('')
  const [options, setOptions] = useState<FilterOption[]>(selectedOptions)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const selected = [...selectedOptions, ...options].find((option) => option.value === value)

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/transactions/filter-options?type=${type}&q=${encodeURIComponent(search.trim())}`, {
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!response.ok) return
        const payload = await response.json() as { options?: FilterOption[] }
        setOptions(payload.options ?? [])
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) console.error(`Could not load ${type} options:`, error)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [search, type])

  return (
    <Field className="min-w-0 gap-1">
      <FieldLabel className="text-xs">{label}</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button type="button" variant="outline" className="w-full justify-between font-normal" />}>
          <span className="truncate">{selected?.label ?? allLabel}</span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-2">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder={`Search ${label.toLowerCase()}…`} autoFocus />
          </div>
          <div className="max-h-64 overflow-y-auto">
            <button type="button" onClick={() => { onChange(''); setOpen(false) }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted">
              <Check className={cn('size-4', value ? 'opacity-0' : 'opacity-100')} />
              {allLabel}
            </button>
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading…</div>
            ) : options.length ? options.map((option) => (
              <button key={option.value} type="button" onClick={() => { onChange(option.value); setOpen(false) }} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-muted">
                <Check className={cn('size-4 shrink-0', value === option.value ? 'opacity-100' : 'opacity-0')} />
                <span className="truncate">{option.label}</span>
              </button>
            )) : <p className="py-6 text-center text-sm text-muted-foreground">No matches.</p>}
          </div>
        </PopoverContent>
      </Popover>
    </Field>
  )
}

function FilterSelect({ label, value, onChange, options, allLabel }: { label: string; value: string; onChange: (value: string) => void; options: FilterOption[]; allLabel: string }) {
  const id = `transaction-${label.toLowerCase().replaceAll(' ', '-')}`
  return (
    <Field className="min-w-0 gap-1">
      <FieldLabel htmlFor={id} className="text-xs">{label}</FieldLabel>
      <NativeSelect id={id} className="w-full" value={value} onChange={(event) => onChange(event.target.value)}>
        <NativeSelectOption value="">{allLabel}</NativeSelectOption>
        {options.map((option) => <NativeSelectOption key={option.value} value={option.value}>{option.label}</NativeSelectOption>)}
      </NativeSelect>
    </Field>
  )
}

function formatLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

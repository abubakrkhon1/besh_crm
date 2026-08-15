'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

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
        <FilterSelect label="Customer" value={params.get('customer') ?? ''} onChange={(value) => update('customer', value)} options={customers} allLabel="All customers" />
        <FilterSelect label="Card" value={params.get('card') ?? ''} onChange={(value) => update('card', value)} options={cards} allLabel="All cards" />
        <FilterSelect label="Fuel type" value={params.get('fuelType') ?? ''} onChange={(value) => update('fuelType', value)} options={fuelTypes.map((type) => ({ value: type, label: formatLabel(type) }))} allLabel="All fuel types" />
      </div>
    </div>
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

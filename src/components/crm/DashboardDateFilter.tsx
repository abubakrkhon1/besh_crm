'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'

type DateRange = { from: string; to: string }
type DatePreset = DateRange & { value: string; label: string }

export function DashboardDateFilter({
  from,
  to,
  path = '/crm/dashboard',
  description = 'Choose the transaction dates to include.',
  showPresets = true,
}: DateRange & { path?: string; description?: string; showPresets?: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const presets = getDatePresets()
  const activePreset = presets.find((preset) => preset.from === from && preset.to === to)

  const applyPreset = (preset: DatePreset) => {
    const next = new URLSearchParams(searchParams)
    next.set('from', preset.from)
    next.set('to', preset.to)
    router.push(`${path}?${next}`)
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center 2xl:justify-self-end">
      <Popover>
        <PopoverTrigger
          render={<Button type="button" variant="outline" size="lg" className="w-full justify-between bg-card shadow-sm sm:w-auto" />}
        >
          <CalendarDays data-icon="inline-start" />
          <span className="tabular-nums">{formatDisplayRange(from, to)}</span>
          <ChevronDown data-icon="inline-end" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] p-4">
          <PopoverHeader>
            <PopoverTitle>Custom date range</PopoverTitle>
            <PopoverDescription>{description}</PopoverDescription>
          </PopoverHeader>
          <form action={path} method="get">
            {[...searchParams.entries()]
              .filter(([key]) => key !== 'from' && key !== 'to')
              .map(([key, value]) => <input key={`${key}-${value}`} type="hidden" name={key} value={value} />)}
            <FieldGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field className="min-w-0">
                <FieldLabel htmlFor="dashboard-date-from">From</FieldLabel>
                <Input id="dashboard-date-from" name="from" type="date" defaultValue={from} max={to} />
              </Field>
              <Field className="min-w-0">
                <FieldLabel htmlFor="dashboard-date-to">To</FieldLabel>
                <Input id="dashboard-date-to" name="to" type="date" defaultValue={to} min={from} />
              </Field>
              <Field orientation="horizontal" className="justify-end sm:col-span-2">
                <Button type="submit">Apply range</Button>
              </Field>
            </FieldGroup>
          </form>
        </PopoverContent>
      </Popover>

      {showPresets && <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button type="button" variant="outline" size="lg" className="w-full justify-between bg-card shadow-sm sm:w-40" />}
        >
          <span>{activePreset?.label ?? 'Custom range'}</span>
          <ChevronDown data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Date range</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={activePreset?.value ?? ''}>
              {presets.map((preset) => (
                <DropdownMenuRadioItem key={preset.value} value={preset.value} onClick={() => applyPreset(preset)}>
                  {preset.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>}
    </div>
  )
}

function getDatePresets(now = new Date()): DatePreset[] {
  const year = now.getFullYear()
  const month = now.getMonth()
  const today = startOfDay(now)

  return [
    createPreset('this_month', 'This month', new Date(year, month, 1), new Date(year, month + 1, 0)),
    createPreset('last_month', 'Last month', new Date(year, month - 1, 1), new Date(year, month, 0)),
    createPreset('last_30_days', 'Last 30 days', addDays(today, -29), today),
    createPreset('last_90_days', 'Last 90 days', addDays(today, -89), today),
    createPreset('year_to_date', 'Year to date', new Date(year, 0, 1), today),
  ]
}

function createPreset(value: string, label: string, from: Date, to: Date): DatePreset {
  return { value, label, from: formatDateInput(from), to: formatDateInput(to) }
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function addDays(value: Date, days: number) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + days)
}

function formatDateInput(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDisplayRange(from: string, to: string) {
  return `${formatDisplayDate(from)} – ${formatDisplayDate(to)}`
}

function formatDisplayDate(value: string) {
  const [year, month, day] = value.split('-')
  return `${month}/${day}/${year}`
}

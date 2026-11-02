'use client'

import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react'
import { toast } from 'sonner'
import {
  importProviderPriceWorkbook,
  previewProviderPriceWorkbook,
  type ProviderPricePreview,
  type ProviderPricingDashboard,
} from '@/app/actions/provider-pricing'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { PriceProvider } from '@/lib/provider-pricing/types'

const providerNames: Record<PriceProvider, string> = { loves: "Love's", pilot: 'Pilot', flying_j: 'Flying J' }

function money(value: number | null) {
  return value == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 3 }).format(value)
}

function localDateKey() {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function ProviderPricingWorkspace({ imports, locations, error }: ProviderPricingDashboard) {
  const [provider, setProvider] = useState<PriceProvider>('loves')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ProviderPricePreview | null>(null)
  const [acceptPartial, setAcceptPartial] = useState(false)
  const [pending, startTransition] = useTransition()
  const [locationSearch, setLocationSearch] = useState('')
  const [locationProvider, setLocationProvider] = useState<'all' | PriceProvider>('all')
  const [locationPage, setLocationPage] = useState(1)
  const locationPageSize = 50
  const filteredLocations = useMemo(() => {
    const search = locationSearch.trim().toLowerCase()
    return locations.filter((location) => {
      if (locationProvider !== 'all' && location.provider !== locationProvider) return false
      return !search || [location.provider_location_id, location.city, location.state, providerNames[location.provider]]
        .some((value) => value.toLowerCase().includes(search))
    })
  }, [locationProvider, locationSearch, locations])
  const locationPageCount = Math.max(1, Math.ceil(filteredLocations.length / locationPageSize))
  const safeLocationPage = Math.min(locationPage, locationPageCount)
  const visibleLocations = filteredLocations.slice((safeLocationPage - 1) * locationPageSize, safeLocationPage * locationPageSize)
  const latestImports = useMemo(() => Object.fromEntries(
    (Object.keys(providerNames) as PriceProvider[]).map((providerCode) => [
      providerCode,
      imports.find((item) => item.provider === providerCode) ?? null,
    ]),
  ) as Record<PriceProvider, ProviderPricingDashboard['imports'][number] | null>, [imports])

  function formData() {
    const data = new FormData()
    data.set('provider', provider)
    if (file) data.set('file', file)
    return data
  }

  function previewFile() {
    if (!file) return toast.error('Choose an Excel workbook first.')
    startTransition(async () => {
      const result = await previewProviderPriceWorkbook(formData())
      setPreview(result)
      setAcceptPartial(false)
      if (!result.ok) toast.error(result.message)
    })
  }

  function confirmImport() {
    if (!file || !preview?.ok || !preview.fileHash) return
    const data = formData()
    data.set('expectedHash', preview.fileHash)
    data.set('acceptPartial', String(acceptPartial))
    startTransition(async () => {
      const result = await importProviderPriceWorkbook(data)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(result.message)
      setPreview(null)
      setFile(null)
      window.location.reload()
    })
  }

  return (
    <div className="flex animate-fade-in flex-col gap-5 pb-12">
      <header>
        <div className="mb-1 flex items-center gap-2"><FileSpreadsheet className="size-5 text-muted-foreground" /><Badge variant="secondary">Diesel pricing</Badge></div>
        <h1 className="text-2xl font-semibold tracking-tight">Savings pricing</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Import daily diesel prices for every provider location. Retail price is the pump price, and Best Discounted Price is the BESH customer price.</p>
      </header>

      {error && <Alert variant="destructive"><AlertTriangle /><AlertTitle>Setup required</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

      <section className="grid gap-3 md:grid-cols-3" aria-label="Provider import freshness">
        {(Object.keys(providerNames) as PriceProvider[]).map((providerCode) => {
          const latest = latestImports[providerCode]
          const today = localDateKey()
          const current = latest?.effective_date === today
          return <Card key={providerCode} className="gap-3 py-4">
            <CardHeader className="px-4"><div className="flex items-center justify-between gap-3"><CardTitle className="text-base">{providerNames[providerCode]}</CardTitle><Badge variant={current ? 'default' : 'secondary'}>{current ? 'Updated today' : latest ? 'Update needed' : 'Not configured'}</Badge></div></CardHeader>
            <CardContent className="px-4 text-sm text-muted-foreground">{latest ? `Latest effective date: ${latest.effective_date}` : 'No workbook has been imported yet.'}</CardContent>
          </Card>
        })}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Upload daily workbook</CardTitle>
          <CardDescription>Each valid row automatically updates the location, pump price, BESH discounted price, and customer savings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
            <label className="space-y-1.5 text-sm font-medium">Provider
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={provider} onChange={(event) => { setProvider(event.target.value as PriceProvider); setPreview(null) }}>
                {Object.entries(providerNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-medium">Excel workbook
              <Input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null) }} />
            </label>
            <Button type="button" onClick={previewFile} disabled={pending || !file}><Upload />{pending ? 'Reading…' : 'Preview import'}</Button>
          </div>

          {preview && !preview.ok && <Alert variant="destructive"><AlertTriangle /><AlertTitle>Workbook cannot be imported</AlertTitle><AlertDescription>{preview.message}</AlertDescription></Alert>}
          {preview?.ok && (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="font-semibold">Import preview</h3><p className="text-sm text-muted-foreground">Effective {preview.effectiveDate} · {providerNames[provider]}</p></div>
                <Badge variant={preview.rejectedRows ? 'destructive' : 'default'}>{preview.rejectedRows ? `${preview.rejectedRows} rejected` : 'Valid workbook'}</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <PreviewMetric label="Rows received" value={preview.totalRows ?? 0} />
                <PreviewMetric label="Valid prices" value={preview.validRows ?? 0} />
                <PreviewMetric label="Existing locations" value={preview.existingLocations ?? 0} />
                <PreviewMetric label="New locations" value={preview.newLocations ?? 0} />
                <PreviewMetric label="Rejected rows" value={preview.rejectedRows ?? 0} />
              </div>
              {!!preview.errors?.length && <div className="max-h-40 overflow-auto rounded-md bg-destructive/5 p-3 text-sm">{preview.errors.map((item) => <p key={`${item.row}-${item.message}`}><strong>Row {item.row}:</strong> {item.message}</p>)}</div>}
              {!!preview.rejectedRows && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={acceptPartial} onChange={(event) => setAcceptPartial(event.target.checked)} />Import valid rows and retain rejected rows in the audit history</label>}
              <div className="flex justify-end"><Button type="button" onClick={confirmImport} disabled={pending || (!!preview.rejectedRows && !acceptPartial)}><CheckCircle2 />{pending ? 'Importing…' : `Import ${preview.validRows?.toLocaleString()} prices`}</Button></div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent imports</CardTitle><CardDescription>Audit history for daily provider files.</CardDescription></CardHeader>
        <CardContent className="px-0">
          <Table><TableHeader><TableRow><TableHead className="pl-6">Provider</TableHead><TableHead>Effective date</TableHead><TableHead>File</TableHead><TableHead>Imported</TableHead><TableHead>Rejected</TableHead><TableHead>New locations</TableHead><TableHead className="pr-6">Status</TableHead></TableRow></TableHeader>
            <TableBody>{imports.map((item) => <TableRow key={item.id}><TableCell className="pl-6 font-medium">{providerNames[item.provider]}</TableCell><TableCell>{item.effective_date}</TableCell><TableCell className="max-w-56 truncate">{item.original_filename}</TableCell><TableCell>{item.imported_rows}</TableCell><TableCell>{item.rejected_rows}</TableCell><TableCell>{item.new_locations}</TableCell><TableCell className="pr-6"><Badge variant={item.status === 'completed' ? 'default' : 'secondary'}>{item.status.replaceAll('_', ' ')}</Badge></TableCell></TableRow>)}{!imports.length && <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No provider workbooks have been imported.</TableCell></TableRow>}</TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current location prices</CardTitle>
          <CardDescription>Customer savings are calculated as pump price minus BESH discounted price.</CardDescription>
        </CardHeader>
        <div className="grid gap-3 border-y px-6 py-3 sm:grid-cols-[1fr_200px_auto] sm:items-center">
          <Input
            type="search"
            value={locationSearch}
            onChange={(event) => { setLocationSearch(event.target.value); setLocationPage(1) }}
            placeholder="Search store number, city, or state"
            aria-label="Search locations"
          />
          <select
            className="flex h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            value={locationProvider}
            onChange={(event) => { setLocationProvider(event.target.value as 'all' | PriceProvider); setLocationPage(1) }}
            aria-label="Filter locations by provider"
          >
            <option value="all">All providers</option>
            {Object.entries(providerNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <p className="text-sm text-muted-foreground">{filteredLocations.length.toLocaleString()} locations</p>
        </div>
        <CardContent className="px-0">
          <Table>
            <TableHeader><TableRow><TableHead className="pl-6">Location</TableHead><TableHead>Pump price</TableHead><TableHead>BESH discounted price</TableHead><TableHead>Customer savings</TableHead><TableHead>Effective date</TableHead><TableHead className="pr-6">Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {visibleLocations.map((location) => <TableRow key={location.id}>
                <TableCell className="pl-6"><p className="font-medium">{providerNames[location.provider]} #{location.provider_location_id}</p><p className="text-xs text-muted-foreground">{location.city}, {location.state}</p></TableCell>
                <TableCell className="tabular-nums">{money(location.latest_pump_price)}</TableCell>
                <TableCell className="font-semibold tabular-nums">{money(location.latest_besh_price)}</TableCell>
                <TableCell className="font-medium tabular-nums text-emerald-600">{money(location.savings_per_gallon)}</TableCell>
                <TableCell>{location.latest_effective_date ?? '—'}</TableCell>
                <TableCell className="pr-6"><Badge variant={location.missing_from_latest_import ? 'secondary' : 'default'}>{location.missing_from_latest_import ? 'Missing from latest file' : 'Current'}</Badge></TableCell>
              </TableRow>)}
              {!visibleLocations.length && <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">{error ? 'Provider pricing is not configured yet.' : locations.length ? 'No locations match this search.' : 'Import a provider workbook to add location prices.'}</TableCell></TableRow>}
            </TableBody>
          </Table>
          {filteredLocations.length > locationPageSize && <div className="flex items-center justify-between border-t px-6 py-3">
            <p className="text-sm text-muted-foreground">Page {safeLocationPage} of {locationPageCount}</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={safeLocationPage <= 1} onClick={() => setLocationPage((page) => Math.max(1, page - 1))}>Previous</Button>
              <Button type="button" size="sm" variant="outline" disabled={safeLocationPage >= locationPageCount} onClick={() => setLocationPage((page) => Math.min(locationPageCount, page + 1))}>Next</Button>
            </div>
          </div>}
        </CardContent>
      </Card>
    </div>
  )
}

function PreviewMetric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value.toLocaleString()}</p></div>
}

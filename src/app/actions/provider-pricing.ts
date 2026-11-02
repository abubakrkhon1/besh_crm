'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createClient, requireRoles } from '@/lib/supabase/server'
import { lovesPriceMapping, parseProviderWorkbook } from '@/lib/provider-pricing/workbook'
import { priceProviders, type PriceProvider, type ProviderPriceMapping } from '@/lib/provider-pricing/types'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const PRICING_ROLES = ['owner', 'admin', 'general_manager'] as const

export type ProviderPricePreview = {
  ok: boolean
  message: string
  fileHash?: string
  provider?: PriceProvider
  mappingId?: string | null
  effectiveDate?: string
  totalRows?: number
  validRows?: number
  rejectedRows?: number
  newLocations?: number
  existingLocations?: number
    reviewLocations?: number
  errors?: Array<{ row: number; message: string }>
  sample?: Array<{
    sourceRowNumber: number
    providerLocationId: string
    city: string
    state: string
    pumpPrice: number
    providerPrice: number
  }>
}

export type ProviderPriceImportResult = {
  ok: boolean
  message: string
  importedRows?: number
  rejectedRows?: number
  newLocations?: number
  reviewLocations?: number
}

export type ProviderPricingDashboard = {
  imports: Array<{
    id: string
    provider: PriceProvider
    original_filename: string
    effective_date: string
    status: string
    received_rows: number
    imported_rows: number
    rejected_rows: number
    new_locations: number
    review_locations: number
    created_at: string
  }>
  locations: Array<{
    id: string
    provider: PriceProvider
    provider_location_id: string
    city: string
    state: string
    location_status: string
    customer_price_per_gallon: number | null
    missing_from_latest_import: boolean
    latest_pump_price: number | null
    latest_besh_price: number | null
    latest_effective_date: string | null
    savings_per_gallon: number | null
  }>
  error: string | null
}

function providerOf(value: FormDataEntryValue | null): PriceProvider | null {
  const provider = String(value ?? '') as PriceProvider
  return priceProviders.includes(provider) ? provider : null
}

async function uploadedFile(formData: FormData) {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) throw new Error('Choose an Excel workbook to upload.')
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('Upload an .xlsx Excel workbook.')
  if (file.size > MAX_FILE_BYTES) throw new Error('The workbook must be 10 MB or smaller.')
  const bytes = await file.arrayBuffer()
  return { file, bytes, hash: createHash('sha256').update(new Uint8Array(bytes)).digest('hex') }
}

async function activeMapping(db: any, provider: PriceProvider) {
  const { data, error } = await db
    .from('provider_price_file_mappings')
    .select('id, worksheet_name, column_mapping')
    .eq('provider', provider)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('activeMapping:', error)
    if (error.code === '42P01' || error.code === 'PGRST205') {
      throw new Error('Apply the provider station pricing migration before previewing workbooks.')
    }
    throw new Error(`The provider mapping could not be loaded: ${error.message}`)
  }
  if (!data && provider !== 'loves') throw new Error('No active workbook mapping exists for this provider yet.')
  const mapping: ProviderPriceMapping = data
    ? { worksheet: data.worksheet_name, columns: data.column_mapping }
    : lovesPriceMapping
  return { id: data?.id ?? null, mapping }
}

export async function previewProviderPriceWorkbook(formData: FormData): Promise<ProviderPricePreview> {
  const { error } = await requireRoles(PRICING_ROLES)
  if (error) return { ok: false, message: 'You do not have permission to import provider pricing.' }
  const provider = providerOf(formData.get('provider'))
  if (!provider) return { ok: false, message: 'Choose a supported provider.' }

  try {
    const { file, bytes, hash } = await uploadedFile(formData)
    const db = await createClient() as any
    const { id: mappingId, mapping } = await activeMapping(db, provider)
    const parsed = await parseProviderWorkbook(bytes, mapping)
    if (parsed.effectiveDates.length !== 1) {
      return { ok: false, message: 'A daily workbook must contain exactly one effective date.' }
    }
    const { data: duplicate, error: duplicateError } = await db
      .from('provider_price_imports')
      .select('id')
      .eq('provider', provider)
      .eq('file_sha256', hash)
      .maybeSingle()
    if (duplicateError) {
      console.error('previewProviderPriceWorkbook duplicate check:', duplicateError)
      if (duplicateError.code === '42P01' || duplicateError.code === 'PGRST205') {
        throw new Error('Apply the provider station pricing migration before previewing workbooks.')
      }
      throw new Error('Previous imports could not be checked.')
    }
    if (duplicate) return { ok: false, message: 'This exact workbook has already been imported.' }

    const existing = new Set<string>()
    for (let start = 0; start < parsed.rows.length; start += 150) {
      const identifiers = parsed.rows.slice(start, start + 150).map((row) => row.providerLocationId)
      const { data, error: locationsError } = await db
        .from('fuel_locations')
        .select('provider_location_id')
        .eq('provider', provider)
        .in('provider_location_id', identifiers)
      if (locationsError) throw new Error('Existing locations could not be matched.')
      for (const location of data ?? []) existing.add(location.provider_location_id)
    }

    const newLocations = parsed.rows.filter((row) => !existing.has(row.providerLocationId)).length

    return {
      ok: true,
      message: `${file.name} is ready for review.`,
      fileHash: hash,
      provider,
      mappingId,
      effectiveDate: parsed.effectiveDates[0],
      totalRows: parsed.rows.length + parsed.errors.length,
      validRows: parsed.rows.length,
      rejectedRows: parsed.errors.length,
      newLocations,
      existingLocations: parsed.rows.length - newLocations,
      reviewLocations: 0,
      errors: parsed.errors.slice(0, 50),
      sample: parsed.rows.slice(0, 12).map(({ sourceRowNumber, providerLocationId, city, state, pumpPrice, providerPrice }) => ({
        sourceRowNumber, providerLocationId, city, state, pumpPrice, providerPrice,
      })),
    }
  } catch (caught) {
    console.error('previewProviderPriceWorkbook:', caught)
    return { ok: false, message: caught instanceof Error ? caught.message : 'The workbook could not be read.' }
  }
}

export async function importProviderPriceWorkbook(formData: FormData): Promise<ProviderPriceImportResult> {
  const { error } = await requireRoles(PRICING_ROLES)
  if (error) return { ok: false, message: 'You do not have permission to import provider pricing.' }
  const provider = providerOf(formData.get('provider'))
  if (!provider) return { ok: false, message: 'Choose a supported provider.' }

  try {
    const { file, bytes, hash } = await uploadedFile(formData)
    const expectedHash = String(formData.get('expectedHash') ?? '')
    if (!expectedHash || expectedHash !== hash) throw new Error('The selected workbook changed after preview. Preview it again.')
    const db = await createClient() as any
    const { id: mappingId, mapping } = await activeMapping(db, provider)
    if (!mappingId) throw new Error('Apply the provider-pricing database migration before importing a workbook.')
    const parsed = await parseProviderWorkbook(bytes, mapping)
    if (parsed.effectiveDates.length !== 1) throw new Error('A daily workbook must contain exactly one effective date.')
    if (parsed.errors.length && formData.get('acceptPartial') !== 'true') {
      throw new Error('This workbook has rejected rows. Confirm that you want to import only the valid rows.')
    }

    const { data, error: importError } = await db.rpc('import_provider_station_prices', {
      p_provider: provider,
      p_mapping_id: mappingId,
      p_original_filename: file.name,
      p_file_sha256: hash,
      p_rows: parsed.rows,
      p_rejected_rows: parsed.errors,
    })
    if (importError) {
      if (importError.code === '23505') throw new Error('This workbook has already been imported.')
      throw new Error(importError.message || 'The provider prices could not be imported.')
    }

    revalidatePath('/crm/savings-pricing')
    return {
      ok: true,
      message: `Imported ${data.importedRows.toLocaleString()} diesel prices.`,
      importedRows: data.importedRows,
      rejectedRows: data.rejectedRows,
      newLocations: data.newLocations,
      reviewLocations: data.reviewLocations,
    }
  } catch (caught) {
    console.error('importProviderPriceWorkbook:', caught)
    return { ok: false, message: caught instanceof Error ? caught.message : 'The workbook could not be imported.' }
  }
}

export async function getProviderPricingDashboard(): Promise<ProviderPricingDashboard> {
  const { error } = await requireRoles(PRICING_ROLES)
  if (error) return { imports: [], locations: [], error: 'You do not have permission to view provider pricing.' }
  const db = await createClient() as any
  const [importsResult, locationsResult] = await Promise.all([
    db.from('provider_price_imports').select('*').order('created_at', { ascending: false }).limit(20),
    db.from('fuel_locations')
      .select('id, provider, provider_location_id, city, state, location_status, customer_price_per_gallon, missing_from_latest_import, fuel_location_prices(pump_price_per_gallon, provider_price_per_gallon, effective_date)')
      .order('provider')
      .order('state')
      .order('city')
      .order('effective_date', { referencedTable: 'fuel_location_prices', ascending: false })
      .limit(1, { referencedTable: 'fuel_location_prices' })
      .limit(5000),
  ])
  if (importsResult.error || locationsResult.error) {
    const missingTable = importsResult.error?.code === '42P01' || locationsResult.error?.code === '42P01'
    return { imports: [], locations: [], error: missingTable ? 'Apply the provider-pricing database migration to enable imports.' : 'Provider pricing could not be loaded.' }
  }
  const locations = (locationsResult.data ?? []).map((location: any) => {
    const prices = [...(location.fuel_location_prices ?? [])].sort((a, b) => b.effective_date.localeCompare(a.effective_date))
    const latest = prices[0]
    const pump = latest ? Number(latest.pump_price_per_gallon) : null
    const beshPrice = latest ? Number(latest.provider_price_per_gallon) : null
    return {
      ...location,
      customer_price_per_gallon: beshPrice,
      latest_pump_price: pump,
      latest_besh_price: beshPrice,
      latest_effective_date: latest?.effective_date ?? null,
      savings_per_gallon: pump == null || beshPrice == null ? null : Math.round((pump - beshPrice) * 1000) / 1000,
    }
  })
  return { imports: importsResult.data ?? [], locations, error: null }
}

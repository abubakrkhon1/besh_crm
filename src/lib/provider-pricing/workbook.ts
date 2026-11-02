import readXlsxFile, { type CellValue, type Row } from 'read-excel-file/node'
import type { NormalizedProviderPriceRow, ProviderPriceMapping, ProviderWorkbookParseResult } from './types'

const MAX_ROWS = 10_000

function text(value: CellValue | null): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value).trim()
}

function number(value: CellValue | null): number {
  const parsed = Number(text(value))
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function excelDate(value: CellValue | null): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const raw = text(value).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return ''
  const parsed = new Date(`${raw}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw ? '' : raw
}

function columnMap(headerRow: Row) {
  const headers = new Map<string, number>()
  headerRow.forEach((cell, columnNumber) => {
    const header = text(cell)
    if (header) headers.set(header, columnNumber)
  })
  return headers
}

export function parseProviderSheet(
  sheetRows: Row[],
  mapping: ProviderPriceMapping,
  worksheetName = mapping.worksheet,
): ProviderWorkbookParseResult {
  if (sheetRows.length - 1 > MAX_ROWS) throw new Error(`Workbook exceeds the ${MAX_ROWS.toLocaleString()} row limit.`)

  const headers = columnMap(sheetRows[0] ?? [])
  const required = [
    mapping.columns.providerLocationId,
    mapping.columns.city,
    mapping.columns.state,
    mapping.columns.latitude,
    mapping.columns.longitude,
    mapping.columns.pumpPrice,
    mapping.columns.providerPrice,
    mapping.columns.effectiveDate,
  ]
  const missing = required.filter((header) => !headers.has(header))
  if (missing.length) throw new Error(`Missing required column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`)

  const value = (row: Row, header?: string) => header ? row[headers.get(header) ?? -1] ?? null : null
  const rows: NormalizedProviderPriceRow[] = []
  const errors: ProviderWorkbookParseResult['errors'] = []
  const seen = new Set<string>()

  for (let rowNumber = 2; rowNumber <= sheetRows.length; rowNumber += 1) {
    const row = sheetRows[rowNumber - 1]
    const providerLocationId = text(value(row, mapping.columns.providerLocationId))
    if (!providerLocationId && !row.some((cell) => cell != null && text(cell) !== '')) continue
    const city = text(value(row, mapping.columns.city))
    const state = text(value(row, mapping.columns.state)).toUpperCase()
    const latitude = number(value(row, mapping.columns.latitude))
    const longitude = number(value(row, mapping.columns.longitude))
    const pumpPrice = number(value(row, mapping.columns.pumpPrice))
    const providerPrice = number(value(row, mapping.columns.providerPrice))
    const effectiveDate = excelDate(value(row, mapping.columns.effectiveDate))
    const rowErrors: string[] = []

    if (!providerLocationId) rowErrors.push('Provider location ID is required')
    if (seen.has(providerLocationId)) rowErrors.push('Provider location ID is duplicated in this file')
    if (!city) rowErrors.push('City is required')
    if (!/^[A-Z]{2}$/.test(state)) rowErrors.push('State must be a two-letter code')
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) rowErrors.push('Latitude is invalid')
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) rowErrors.push('Longitude is invalid')
    if (!Number.isFinite(pumpPrice) || pumpPrice <= 0 || pumpPrice > 20) rowErrors.push('Pump price must be between $0 and $20')
    if (!Number.isFinite(providerPrice) || providerPrice <= 0 || providerPrice > 20) rowErrors.push('Provider price must be between $0 and $20')
    if (Number.isFinite(pumpPrice) && Number.isFinite(providerPrice) && providerPrice > pumpPrice) rowErrors.push('Provider price cannot exceed pump price')
    if (!effectiveDate) rowErrors.push('Effective date is invalid')

    seen.add(providerLocationId)
    if (rowErrors.length) {
      errors.push({ row: rowNumber, message: rowErrors.join('; ') })
      continue
    }

    rows.push({
      sourceRowNumber: rowNumber,
      providerLocationId,
      billingStationCode: text(value(row, mapping.columns.billingStationCode)) || null,
      city,
      state,
      latitude,
      longitude,
      pumpPrice: Math.round(pumpPrice * 1000) / 1000,
      providerPrice: Math.round(providerPrice * 1000) / 1000,
      effectiveDate,
      pricingMethod: text(value(row, mapping.columns.pricingMethod)) || null,
      customerAccount: text(value(row, mapping.columns.customerAccount)) || null,
      rackId: text(value(row, mapping.columns.rackId)) || null,
    })
  }

  return {
    worksheet: worksheetName,
    rows,
    errors,
    effectiveDates: [...new Set(rows.map((row) => row.effectiveDate))].sort(),
  }
}

export async function parseProviderWorkbook(
  bytes: ArrayBuffer,
  mapping: ProviderPriceMapping,
): Promise<ProviderWorkbookParseResult> {
  const sheets = await readXlsxFile(Buffer.from(bytes))
  const worksheet = sheets.find((sheet) => sheet.sheet === mapping.worksheet)
  if (!worksheet) throw new Error(`Worksheet “${mapping.worksheet}” was not found.`)
  return parseProviderSheet(worksheet.data, mapping, worksheet.sheet)
}

export const lovesPriceMapping: ProviderPriceMapping = {
  worksheet: 'LovesPrices',
  columns: {
    providerLocationId: 'Loves Store No.',
    billingStationCode: 'Billing Card Station Code',
    city: 'City',
    state: 'State',
    latitude: 'Latitude',
    longitude: 'Longitude',
    pumpPrice: 'Retail Price',
    providerPrice: 'Best Discounted Price',
    effectiveDate: 'Effective Date',
    pricingMethod: 'Discounted Type Applied',
    customerAccount: 'Customer',
    rackId: 'OPIS Rack ID',
  },
}

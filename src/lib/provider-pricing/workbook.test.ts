import { describe, expect, it } from 'vitest'
import { lovesPriceMapping, parseProviderSheet } from './workbook'

function sheet(rows: Array<Array<string | number>>) {
  return [[
    'Customer', 'Loves Store No.', 'City', 'State', 'Billing Card Station Code', 'OPIS Rack ID',
    'Retail Price', 'Best Discounted Price', 'Discounted Type Applied', 'Effective Date', 'Latitude', 'Longitude',
  ], ...rows]
}

describe('parseProviderWorkbook', () => {
  it('normalizes a valid Love’s diesel price row', async () => {
    const result = await parseProviderSheet(sheet([['AFS World LLC', '206', 'Loxley', 'AL', 'AL0005', '715', 6.299, 5.67, 'O', '2026-10-29', 30.6544, -87.7594]]), lovesPriceMapping)
    expect(result.errors).toEqual([])
    expect(result.effectiveDates).toEqual(['2026-10-29'])
    expect(result.rows[0]).toMatchObject({ providerLocationId: '206', pumpPrice: 6.299, providerPrice: 5.67, state: 'AL' })
  })

  it('rejects duplicates and an inverted provider price', async () => {
    const result = await parseProviderSheet(sheet([
      ['AFS World LLC', '206', 'Loxley', 'AL', 'AL0005', '715', 5, 6, 'O', '2026-10-29', 30.6544, -87.7594],
      ['AFS World LLC', '206', 'Loxley', 'AL', 'AL0005', '715', 6, 5, 'O', '2026-10-29', 30.6544, -87.7594],
    ]), lovesPriceMapping)
    expect(result.rows).toHaveLength(0)
    expect(result.errors[0].message).toContain('cannot exceed')
    expect(result.errors[1].message).toContain('duplicated')
  })
})

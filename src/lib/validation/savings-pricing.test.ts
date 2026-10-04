import { describe, expect, it } from 'vitest'
import { setStationSavingsPriceSchema } from './savings-pricing'

describe('setStationSavingsPriceSchema', () => {
  const valid = { stationBrand: 'loves', pumpPrice: '4.500', wexPrice: '4.000', customerPrice: '4.200', effectiveDate: '2026-09-08', note: '' }

  it('accepts ordered pump, WEX, and customer prices', () => {
    expect(setStationSavingsPriceSchema.parse(valid)).toEqual({
      ...valid,
      pumpPrice: 4.5,
      wexPrice: 4,
      customerPrice: 4.2,
      note: null,
    })
  })

  it.each(['0', '-1', '20.001', '3.4299', 'abc'])('rejects invalid price %s', (price) => {
    expect(setStationSavingsPriceSchema.safeParse({ ...valid, customerPrice: price }).success).toBe(false)
  })

  it('requires the WEX price to be no higher than the customer price', () => {
    expect(setStationSavingsPriceSchema.safeParse({ ...valid, wexPrice: '4.300' }).success).toBe(false)
  })

  it('requires the customer price to be no higher than the pump price', () => {
    expect(setStationSavingsPriceSchema.safeParse({ ...valid, customerPrice: '4.600' }).success).toBe(false)
  })

  it('rejects unsupported stations and impossible dates', () => {
    expect(setStationSavingsPriceSchema.safeParse({ ...valid, stationBrand: 'shell' }).success).toBe(false)
    expect(setStationSavingsPriceSchema.safeParse({ ...valid, effectiveDate: '2026-02-30' }).success).toBe(false)
  })
})

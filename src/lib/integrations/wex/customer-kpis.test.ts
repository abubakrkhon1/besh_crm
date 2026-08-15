import { describe, expect, it } from 'vitest'
import { accumulateCustomerSpend, roundCurrency, type CustomerSpendTotals } from './customer-kpis'

describe('customer spend KPIs', () => {
  it('calculates month-to-date and lifetime spend across pages', () => {
    const totals: CustomerSpendTotals = new Map()
    const monthStart = '2026-08-01T00:00:00.000Z'

    accumulateCustomerSpend(totals, [
      { customer_id: 'customer-a', amount: '40.25', transaction_date: '2026-07-31T23:59:59.000Z' },
      { customer_id: 'customer-a', amount: 60.5, transaction_date: '2026-08-01T00:00:00.000Z' },
    ], monthStart)
    accumulateCustomerSpend(totals, [
      { customer_id: 'customer-a', amount: -5, transaction_date: '2026-08-02T12:00:00.000Z' },
      { customer_id: 'customer-b', amount: 12.1, transaction_date: '2026-08-03T12:00:00.000Z' },
    ], monthStart)

    expect(totals.get('customer-a')).toEqual({ monthlySpend: 55.5, lifetimeSpend: 95.75 })
    expect(totals.get('customer-b')).toEqual({ monthlySpend: 12.1, lifetimeSpend: 12.1 })
  })

  it('rounds floating-point totals to database currency precision', () => {
    expect(roundCurrency(466557.3400000011)).toBe(466557.34)
  })
})

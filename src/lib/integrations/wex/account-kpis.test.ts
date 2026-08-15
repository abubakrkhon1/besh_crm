import { describe, expect, it } from 'vitest'
import { calculateAccountCreditKpis } from './account-kpis'
import type { WexCreditLimits } from './types'

const limit = (overrides: Partial<WexCreditLimits> = {}): WexCreditLimits => ({
  contractStatus: 'ACTIVE', transactionLimit: 0, originalLimit: 25_000,
  creditAvailable: 16_657.82, dailyLimit: 0, dailyAvailable: 0,
  totalAvailable: 16_657.82, maxMoneyCode: 0, unitOfMeasure: 'USD', ...overrides,
})

describe('account credit KPIs', () => {
  it('maps original and available credit into CRM values', () => {
    expect(calculateAccountCreditKpis([limit()])).toEqual({ creditLimit: 25_000, currentBalance: 8_342.18 })
  })

  it('aggregates multiple open contracts and ignores closed contracts', () => {
    expect(calculateAccountCreditKpis([
      limit(),
      limit({ originalLimit: 5_000, creditAvailable: 4_000 }),
      limit({ contractStatus: 'CLOSED', originalLimit: 99_000, creditAvailable: 0 }),
    ])).toEqual({ creditLimit: 30_000, currentBalance: 9_342.18 })
  })

  it('does not produce a negative used balance when credit is overfunded', () => {
    expect(calculateAccountCreditKpis([limit({ originalLimit: 10_000, creditAvailable: 10_500 })]).currentBalance).toBe(0)
  })
})

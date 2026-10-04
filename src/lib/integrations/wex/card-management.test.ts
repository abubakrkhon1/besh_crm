import { describe, expect, it } from 'vitest'
import { cardLimitsActionSchema, cardOrderActionSchema, cardReplacementActionSchema, cardStatusActionSchema } from './schemas'

const requestId = '6f7a28c8-61e0-4ee1-a0cc-588eb61ae31f'
const cardId = '3d8b06ac-382b-4a52-8c87-0bb0a629436a'

describe('WEX card-management validation', () => {
  it('accepts only explicit freeze and unfreeze actions', () => {
    expect(cardStatusActionSchema.safeParse({ fuelCardId: cardId, action: 'freeze', idempotencyKey: requestId }).success).toBe(true)
    expect(cardStatusActionSchema.safeParse({ fuelCardId: cardId, action: 'fraud', idempotencyKey: requestId }).success).toBe(false)
  })

  it('requires at least one whole-number card limit', () => {
    const empty = { fuelCardId: cardId, idempotencyKey: requestId, dailyAmount: null, weeklyAmount: null, monthlyAmount: null, dailyTransactions: null, weeklyTransactions: null, monthlyTransactions: null }
    expect(cardLimitsActionSchema.safeParse(empty).success).toBe(false)
    expect(cardLimitsActionSchema.safeParse({ ...empty, dailyAmount: 500 }).success).toBe(true)
    expect(cardLimitsActionSchema.safeParse({ ...empty, dailyAmount: 500.25 }).success).toBe(false)
  })

  it('validates one-card US shipping orders', () => {
    const order = {
      idempotencyKey: requestId, customerId: null, orderType: 2, policyNumber: 1, cardStyle: 4,
      embossedName: 'TEST DRIVER', shipToFirst: 'Test', shipToLast: 'Driver',
      shipToAddress1: '1 Main Street', shipToAddress2: '', shipToCity: 'Tulsa', shipToState: 'ok',
      shipToZip: '74101', shippingMethod: 1, rushProcessing: false, cardCarrier: '',
    }
    const parsed = cardOrderActionSchema.safeParse(order)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.shipToState).toBe('OK')
    expect(cardOrderActionSchema.safeParse({ ...order, shipToZip: 'bad' }).success).toBe(false)
  })

  it('validates lost, stolen, and damaged replacement requests', () => {
    const replacement = {
      fuelCardId: cardId, idempotencyKey: requestId, replacementType: 'lost', reason: 'Lost by driver',
      shipToFirst: 'Test', shipToLast: 'Driver', shipToAddress1: '1 Main Street', shipToAddress2: '',
      shipToCity: 'Tulsa', shipToState: 'ok', shipToZip: '74101', shippingMethod: 1, rushProcessing: false,
    }
    const parsed = cardReplacementActionSchema.safeParse(replacement)
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.shipToState).toBe('OK')
    expect(cardReplacementActionSchema.safeParse({ ...replacement, replacementType: 'expired' }).success).toBe(false)
  })
})

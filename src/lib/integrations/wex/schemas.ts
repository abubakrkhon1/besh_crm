import { z } from 'zod'

export const wexEnvSchema = z.object({
  WEX_API_USERNAME: z.string().min(1),
  WEX_API_PASSWORD: z.string().min(1),
  WEX_SOAP_ENDPOINT_URL: z.string().url(),
  WEX_HTTP_PROXY: z.string().url(),
  WEX_CARD_FINGERPRINT_SECRET: z.string().min(32),
})

export function validateWexEnvironment() {
  const result = wexEnvSchema.safeParse(process.env)
  if (result.success) return { ok: true as const, missing: [] as string[] }
  return {
    ok: false as const,
    missing: result.error.issues.map((issue) => issue.path.join('.')).filter(Boolean),
  }
}

const nullable = z.string().nullable()
const nullableNumber = z.number().finite().nullable()
export const normalizedWexCardSchema = z.object({
  cardNumber: z.string().min(4), policyNumber: nullable, companyXRef: nullable,
  unitNumber: nullable, driverId: nullable, driverName: nullable, override: nullable,
  beingOverridden: z.boolean(), status: z.string().min(1), payrollStatus: nullable,
  payrollUse: nullable, gpsid: nullable, vin: nullable, zid: nullable, infosrc: nullable,
  policySubfleet: nullable, cardSubfleet: nullable,
})

export const normalizedWexTransactionTaxSchema = z.object({
  description: nullable, amount: z.number().finite(), taxClass: nullable,
  taxCode: nullable, exempt: z.boolean(),
})

export const normalizedWexTransactionLineItemSchema = z.object({
  amount: z.number().finite(), category: nullable, discountAmount: z.number().finite(),
  fuelType: nullable, pricePerUnit: nullableNumber, productCode: nullable,
  quantity: z.number().finite(), retailPricePerUnit: nullableNumber,
  retailAmount: nullableNumber, serviceType: nullable,
  taxes: z.array(normalizedWexTransactionTaxSchema),
})

export const normalizedWexTransactionSchema = z.object({
  transactionId: z.string().min(1), carrierId: z.string().min(1), companyXRef: nullable,
  cardNumber: z.string().min(4), transactionDate: z.string().datetime({ offset: true }),
  amount: z.number().finite(), discountAmount: z.number().finite(), merchantName: nullable,
  merchantAddress: nullable, merchantState: nullable, gallons: z.number().finite().nullable(),
  transactionType: z.string().min(1), authorizationCode: nullable, invoiceNumber: nullable,
  contractId: z.number().int().nullable(), billingCurrency: nullable, fundedTotal: nullableNumber,
  settledAmount: nullableNumber, preferredTotal: nullableNumber, feesTotal: z.number().finite(),
  preDiscountTax: nullableNumber, postDiscountTax: nullableNumber, taxExemptAmount: nullableNumber,
  locationId: nullable, merchantCity: nullable, merchantZip: nullable, merchantCountry: nullable,
  merchantLatitude: nullable, merchantLongitude: nullable, entryMode: nullable,
  handEntered: z.boolean(), originalTransactionId: nullable, statementId: nullable,
  promptValues: z.array(z.object({ type: z.string(), value: z.string() })),
  lineItems: z.array(normalizedWexTransactionLineItemSchema),
  taxes: z.array(normalizedWexTransactionTaxSchema),
})

export const normalizedWexContractSchema = z.object({
  contractId: z.number().int(), status: z.string().min(1), description: nullable,
  currency: nullable, limitMethod: z.number().int(), masterContract: z.boolean(),
})

export const normalizedWexCreditLimitsSchema = z.object({
  contractStatus: z.string().min(1), transactionLimit: z.number().finite(),
  originalLimit: z.number().finite(), creditAvailable: z.number().finite(),
  dailyLimit: z.number().finite(), dailyAvailable: z.number().finite(),
  totalAvailable: z.number().finite(), maxMoneyCode: z.number().finite(),
  unitOfMeasure: nullable,
})

export const syncActionSchema = z.object({ confirm: z.literal(true) })
export const syncRunSchema = z.object({ runId: z.string().uuid() })
export const mappingActionSchema = z.object({
  fuelCardId: z.string().uuid(), customerId: z.string().uuid().nullable(),
})
const optionalLimit = z.number().int().min(0).max(1_000_000).nullable()
const optionalCountLimit = z.number().int().min(0).max(10_000).nullable()
export const cardStatusActionSchema = z.object({
  fuelCardId: z.string().uuid(),
  action: z.enum(['freeze', 'unfreeze']),
  idempotencyKey: z.string().uuid(),
})
export const cardLimitsActionSchema = z.object({
  fuelCardId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  dailyAmount: optionalLimit,
  weeklyAmount: optionalLimit,
  monthlyAmount: optionalLimit,
  dailyTransactions: optionalCountLimit,
  weeklyTransactions: optionalCountLimit,
  monthlyTransactions: optionalCountLimit,
}).refine((value) => [value.dailyAmount, value.weeklyAmount, value.monthlyAmount, value.dailyTransactions, value.weeklyTransactions, value.monthlyTransactions].some((item) => item != null), {
  message: 'Enter at least one spending or transaction limit.',
})
export const cardOrderActionSchema = z.object({
  idempotencyKey: z.string().uuid(),
  customerId: z.string().uuid().nullable(),
  orderType: z.number().int().positive(),
  policyNumber: z.number().int().positive(),
  cardStyle: z.number().int().positive(),
  embossedName: z.string().trim().min(1).max(26),
  shipToFirst: z.string().trim().min(1).max(50),
  shipToLast: z.string().trim().min(1).max(50),
  shipToAddress1: z.string().trim().min(1).max(100),
  shipToAddress2: z.string().trim().max(100),
  shipToCity: z.string().trim().min(1).max(50),
  shipToState: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  shipToZip: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/, 'Enter a valid US ZIP code.'),
  shippingMethod: z.number().int().min(0).max(99),
  rushProcessing: z.boolean(),
  cardCarrier: z.string().trim().max(50),
})
export const cardReplacementActionSchema = z.object({
  fuelCardId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  replacementType: z.enum(['lost', 'stolen', 'damaged']),
  shipToFirst: z.string().trim().min(1).max(50),
  shipToLast: z.string().trim().min(1).max(50),
  shipToAddress1: z.string().trim().min(1).max(100),
  shipToAddress2: z.string().trim().max(100),
  shipToCity: z.string().trim().min(1).max(50),
  shipToState: z.string().trim().length(2).transform((value) => value.toUpperCase()),
  shipToZip: z.string().trim().regex(/^\d{5}(?:-\d{4})?$/, 'Enter a valid US ZIP code.'),
  shippingMethod: z.number().int().min(0).max(99),
  rushProcessing: z.boolean(),
  reason: z.string().trim().min(1).max(100),
})
export const cardPinActionSchema = z.object({ fuelCardId: z.string().uuid(), idempotencyKey: z.string().uuid(), pin: z.string().regex(/^\d{4,12}$/, 'PIN must contain 4–12 digits.') })
export const cardRemovalActionSchema = z.object({ fuelCardId: z.string().uuid(), idempotencyKey: z.string().uuid(), confirmation: z.literal('REMOVE') })
export const fuelCardQuerySchema = z.object({
  q: z.string().trim().max(100).catch(''), status: z.string().trim().max(50).catch(''),
  match: z.enum(['all', 'matched', 'unmatched']).catch('all'),
  policy: z.string().trim().max(100).catch(''), customer: z.string().uuid().or(z.literal('')).catch(''),
  sync: z.enum(['all', 'current', 'stale']).catch('all'),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).catch(''), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).catch(''),
  sort: z.enum(['last_synced_at', 'driver_name', 'unit_number', 'status']).catch('status'),
  dir: z.enum(['asc', 'desc']).catch('asc'), page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().refine((value) => [10, 25, 50, 100].includes(value)).catch(25),
})

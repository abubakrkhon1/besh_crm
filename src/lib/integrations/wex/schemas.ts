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
export const normalizedWexCardSchema = z.object({
  cardNumber: z.string().min(4), policyNumber: nullable, companyXRef: nullable,
  unitNumber: nullable, driverId: nullable, driverName: nullable, override: nullable,
  beingOverridden: z.boolean(), status: z.string().min(1), payrollStatus: nullable,
  payrollUse: nullable, gpsid: nullable, vin: nullable, zid: nullable, infosrc: nullable,
  policySubfleet: nullable, cardSubfleet: nullable,
})

export const normalizedWexTransactionSchema = z.object({
  transactionId: z.string().min(1), carrierId: z.string().min(1), companyXRef: nullable,
  cardNumber: z.string().min(4), transactionDate: z.string().datetime({ offset: true }),
  amount: z.number().finite(), discountAmount: z.number().finite(), merchantName: nullable,
  merchantAddress: nullable, merchantState: nullable, gallons: z.number().finite().nullable(),
  transactionType: z.string().min(1),
})

export const syncActionSchema = z.object({ confirm: z.literal(true) })
export const mappingActionSchema = z.object({
  fuelCardId: z.string().uuid(), customerId: z.string().uuid().nullable(),
})
export const fuelCardQuerySchema = z.object({
  q: z.string().trim().max(100).catch(''), status: z.string().trim().max(50).catch(''),
  match: z.enum(['all', 'matched', 'unmatched']).catch('all'),
  sort: z.enum(['last_synced_at', 'driver_name', 'unit_number', 'status']).catch('status'),
  dir: z.enum(['asc', 'desc']).catch('asc'), page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().refine((value) => [10, 25, 50, 100].includes(value)).catch(25),
})

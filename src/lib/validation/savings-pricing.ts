import { z } from 'zod'

export const stationBrands = ['loves', 'pilot', 'flying_j'] as const

const price = (label: string) => z.string()
  .trim()
  .regex(/^\d+(?:\.\d{1,3})?$/, `${label} must have no more than three decimal places.`)
  .transform(Number)
  .refine((value) => value > 0 && value <= 20, `${label} must be greater than $0 and no more than $20 per gallon.`)

const localDate = z.string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid effective date.')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  }, 'Choose a valid effective date.')

export const setStationSavingsPriceSchema = z.object({
  stationBrand: z.enum(stationBrands, { error: 'Choose a supported station.' }),
  pumpPrice: price('Pump price'),
  wexPrice: price('WEX price'),
  customerPrice: price('Customer price'),
  effectiveDate: localDate,
  note: z.string().trim().max(160, 'Internal note must be 160 characters or fewer.').transform((value) => value || null),
}).superRefine((values, context) => {
  if (values.wexPrice > values.customerPrice) {
    context.addIssue({ code: 'custom', path: ['customerPrice'], message: 'Customer price must be at least the WEX price.' })
  }
  if (values.customerPrice > values.pumpPrice) {
    context.addIssue({ code: 'custom', path: ['customerPrice'], message: 'Customer price cannot be higher than the pump price.' })
  }
})

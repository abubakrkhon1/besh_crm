import { z } from 'zod'

const optionalText = (maximum: number) => z.string().trim().max(maximum).transform((value) => value || null)

export const updateCustomerSchema = z.object({
  customerId: z.string().uuid('Customer ID is invalid.'),
  companyName: z.string().trim().min(2, 'Company name must be at least 2 characters.').max(160),
  contactName: optionalText(120),
  email: z.string().trim().max(254).refine((value) => !value || z.string().email().safeParse(value).success, 'Enter a valid email address.').transform((value) => value.toLowerCase() || null),
  phone: optionalText(50),
  status: z.enum(['active', 'pending', 'suspended', 'closed']),
  creditLimit: z.coerce.number().finite().min(0, 'Credit limit cannot be negative.').max(100_000_000, 'Credit limit is too large.'),
  notes: optionalText(2_000),
})

export type UpdateCustomerInput = z.input<typeof updateCustomerSchema>
export type UpdateCustomerField = keyof UpdateCustomerInput

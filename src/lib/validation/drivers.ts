import { z } from 'zod'

const commonPasswords = new Set([
  'password1234',
  'password123!',
  'qwerty123456',
  'letmein12345',
  'welcome12345',
])

export const driverInvitationSchema = z.object({
  driverId: z.string().uuid('Driver ID is invalid.'),
  email: z.string()
    .trim()
    .min(1, 'Enter the driver email address.')
    .max(254, 'Email address must be 254 characters or fewer.')
    .pipe(z.email('Enter a valid email address.'))
    .transform((value) => value.toLowerCase()),
})

export const driverActivationSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Activation link is invalid.'),
  password: z.string()
    .min(12, 'Use at least 12 characters.')
    .max(128, 'Password must be 128 characters or fewer.')
    .refine((value) => !value.includes('\0'), 'Password contains an invalid character.')
    .refine((value) => !commonPasswords.has(value.toLowerCase()), 'Choose a less common password.'),
  confirmPassword: z.string(),
}).superRefine((value, context) => {
  if (value.password !== value.confirmPassword) {
    context.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Passwords do not match.' })
  }
})

export type DriverActivationState = {
  success?: boolean
  error?: string
  fieldErrors?: Partial<Record<'password' | 'confirmPassword', string>>
}

import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string()
    .trim()
    .min(1, 'Enter your email address.')
    .max(254, 'Email address must be 254 characters or fewer.')
    .refine((value) => z.email().safeParse(value).success, 'Enter a valid email address.')
    .transform((value) => value.toLowerCase()),
  password: z.string()
    .min(1, 'Enter your password.')
    .max(1_024, 'Password is too long.')
    .refine((value) => !value.includes('\0'), 'Password contains an invalid character.'),
})

export type LoginField = keyof z.input<typeof loginSchema>
export type LoginFieldErrors = Partial<Record<LoginField, string>>

export interface LoginResult {
  error?: string
  fieldErrors?: LoginFieldErrors
}

export function getLoginFieldErrors(error: z.ZodError): LoginFieldErrors {
  const fieldErrors: LoginFieldErrors = {}

  for (const issue of error.issues) {
    const field = issue.path[0]
    if ((field === 'email' || field === 'password') && !fieldErrors[field]) {
      fieldErrors[field] = issue.message
    }
  }

  return fieldErrors
}

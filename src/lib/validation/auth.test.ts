import { describe, expect, it } from 'vitest'

import {
  getLoginFieldErrors,
  getResetPasswordFieldErrors,
  loginSchema,
  resetPasswordSchema,
} from './auth'

describe('loginSchema', () => {
  it('trims and normalizes email addresses', () => {
    const parsed = loginSchema.parse({
      email: '  Sales.Rep@Example.COM  ',
      password: 'valid-password',
    })

    expect(parsed.email).toBe('sales.rep@example.com')
  })

  it('does not alter passwords', () => {
    const password = '  <script>not-markup-here</script>  '
    const parsed = loginSchema.parse({ email: 'rep@example.com', password })

    expect(parsed.password).toBe(password)
  })

  it('rejects invalid credentials before authentication', () => {
    const result = loginSchema.safeParse({ email: 'not-an-email', password: '' })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(getLoginFieldErrors(result.error)).toEqual({
        email: 'Enter a valid email address.',
        password: 'Enter your password.',
      })
    }
  })

  it('rejects null bytes and oversized input', () => {
    expect(loginSchema.safeParse({ email: 'rep@example.com', password: 'abc\0def' }).success).toBe(false)
    expect(loginSchema.safeParse({ email: `${'a'.repeat(250)}@example.com`, password: 'password' }).success).toBe(false)
    expect(loginSchema.safeParse({ email: 'rep@example.com', password: 'a'.repeat(1_025) }).success).toBe(false)
  })
})

describe('resetPasswordSchema', () => {
  it('accepts a matching strong password', () => {
    expect(resetPasswordSchema.safeParse({
      password: 'NewPassword1!',
      confirmPassword: 'NewPassword1!',
    }).success).toBe(true)
  })

  it('reports password strength and confirmation errors by field', () => {
    const result = resetPasswordSchema.safeParse({
      password: 'password',
      confirmPassword: 'different',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(getResetPasswordFieldErrors(result.error)).toEqual({
        password: 'Password must contain an uppercase letter.',
        confirmPassword: 'Passwords do not match.',
      })
    }
  })
})

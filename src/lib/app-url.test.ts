import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

let validateApplicationBaseUrl: typeof import('./app-url').validateApplicationBaseUrl

beforeAll(async () => {
  ({ validateApplicationBaseUrl } = await import('./app-url'))
})

describe('canonical application URL', () => {
  it('requires explicit configuration in production', () => {
    expect(() => validateApplicationBaseUrl(undefined, 'production')).toThrow('required in production')
  })

  it('accepts a configured HTTPS origin and normalizes its trailing slash', () => {
    expect(validateApplicationBaseUrl('https://crm.example.com/', 'production')).toBe('https://crm.example.com')
  })

  it.each([
    'http://crm.example.com',
    'javascript:alert(1)',
    'https://user:password@crm.example.com',
    'https://crm.example.com/path',
    'https://crm.example.com?next=https://attacker.invalid',
    'https://crm.example.com/#fragment',
    'not a URL',
  ])('rejects invalid or unsafe production configuration %j', (value) => {
    expect(() => validateApplicationBaseUrl(value, 'production')).toThrow()
  })

  it('uses a fixed loopback origin for unconfigured development', () => {
    expect(validateApplicationBaseUrl(undefined, 'development')).toBe('http://localhost:3000')
    expect(validateApplicationBaseUrl('http://127.0.0.1:4000', 'test')).toBe('http://127.0.0.1:4000')
  })

  it('does not consult request-controlled host headers', () => {
    const source = readFileSync(new URL('./app-url.ts', import.meta.url), 'utf8')
    expect(source).not.toContain("from 'next/headers'")
    expect(source).not.toMatch(/x-forwarded-host|headers\(\)|get\(['"]host['"]\)/i)
  })
})

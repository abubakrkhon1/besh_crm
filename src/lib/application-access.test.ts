import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  APPLICATION_SAFE_COLUMNS,
  APPLICATION_SENSITIVE_FIELDS,
  withoutSensitiveApplicationFields,
} from './application-access'

describe('application staff data boundary', () => {
  it('never includes sensitive identifiers in the safe database projection', () => {
    for (const field of APPLICATION_SENSITIVE_FIELDS) {
      expect(APPLICATION_SAFE_COLUMNS).not.toContain(field)
    }
  })

  it('adds unavailable placeholders without restoring sensitive values', () => {
    const safeApplication = {
      id: 'application-id',
      company_legal_name: 'Example Fleet',
    } as Parameters<typeof withoutSensitiveApplicationFields>[0]

    expect(withoutSensitiveApplicationFields(safeApplication)).toMatchObject({
      id: 'application-id',
      company_legal_name: 'Example Fleet',
      taxpayer_id: null,
      checking_account_number: null,
      aba_routing_number: null,
      social_security_number: null,
      date_of_birth: null,
    })
  })

  it('revokes broad browser access before granting the safe projection', () => {
    const migration = readFileSync(
      new URL('../../supabase/migrations/20260927000000_restrict_application_sensitive_columns.sql', import.meta.url),
      'utf8',
    )
    const safeSelectGrant = migration.match(/grant select \(([\s\S]*?)\) on table public\.applications to authenticated;/i)?.[1]

    expect(migration).toMatch(/revoke select on table public\.applications from anon, authenticated;/i)
    expect(migration).toMatch(/revoke update on table public\.applications from authenticated;/i)
    expect(safeSelectGrant).toBeTruthy()
    for (const field of APPLICATION_SENSITIVE_FIELDS) {
      expect(safeSelectGrant).not.toMatch(new RegExp(`\\b${field}\\b`))
    }
  })
})

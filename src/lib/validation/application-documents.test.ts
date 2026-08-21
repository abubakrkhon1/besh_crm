import { describe, expect, it } from 'vitest'
import { hasAllowedApplicationDocumentSignature } from './application-documents'

describe('application document signatures', () => {
  it('accepts real PDF, PNG, and JPEG headers', () => {
    expect(hasAllowedApplicationDocumentSignature(new TextEncoder().encode('%PDF-1.7'), 'application/pdf')).toBe(true)
    expect(hasAllowedApplicationDocumentSignature(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png')).toBe(true)
    expect(hasAllowedApplicationDocumentSignature(Uint8Array.from([255, 216, 255, 224]), 'image/jpeg')).toBe(true)
  })

  it('rejects renamed or unsupported content', () => {
    const executable = new TextEncoder().encode('MZ executable')
    expect(hasAllowedApplicationDocumentSignature(executable, 'application/pdf')).toBe(false)
    expect(hasAllowedApplicationDocumentSignature(executable, 'image/png')).toBe(false)
    expect(hasAllowedApplicationDocumentSignature(executable, 'image/svg+xml')).toBe(false)
  })
})


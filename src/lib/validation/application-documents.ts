export const ALLOWED_APPLICATION_DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const
export const MAX_APPLICATION_DOCUMENT_BYTES = 10_485_760

export function hasAllowedApplicationDocumentSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === 'application/pdf') return bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-'
  if (mimeType === 'image/png') return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  return false
}


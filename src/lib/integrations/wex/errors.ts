export type WexErrorKind = 'configuration' | 'network' | 'http' | 'authentication' | 'soap_fault' | 'validation' | 'response_too_large' | 'provider_rejected'

export class WexError extends Error {
  constructor(message: string, public readonly kind: WexErrorKind, public readonly retryable = false) {
    super(message)
    this.name = 'WexError'
  }
}

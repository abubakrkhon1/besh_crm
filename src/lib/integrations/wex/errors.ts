export type WexErrorKind = 'configuration' | 'network' | 'http' | 'authentication' | 'soap_fault' | 'validation'

export class WexError extends Error {
  constructor(message: string, public readonly kind: WexErrorKind, public readonly retryable = false) {
    super(message)
    this.name = 'WexError'
  }
}

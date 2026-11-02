export const priceProviders = ['loves', 'pilot', 'flying_j'] as const

export type PriceProvider = (typeof priceProviders)[number]

export type ProviderPriceMapping = {
  worksheet: string
  columns: {
    providerLocationId: string
    billingStationCode?: string
    city: string
    state: string
    latitude: string
    longitude: string
    pumpPrice: string
    providerPrice: string
    effectiveDate: string
    pricingMethod?: string
    customerAccount?: string
    rackId?: string
  }
}

export type NormalizedProviderPriceRow = {
  sourceRowNumber: number
  providerLocationId: string
  billingStationCode: string | null
  city: string
  state: string
  latitude: number
  longitude: number
  pumpPrice: number
  providerPrice: number
  effectiveDate: string
  pricingMethod: string | null
  customerAccount: string | null
  rackId: string | null
}

export type ProviderWorkbookParseResult = {
  worksheet: string
  rows: NormalizedProviderPriceRow[]
  errors: Array<{ row: number; message: string }>
  effectiveDates: string[]
}

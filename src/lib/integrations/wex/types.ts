export type WexCard = {
  cardNumber: string
  policyNumber: string | null
  companyXRef: string | null
  unitNumber: string | null
  driverId: string | null
  driverName: string | null
  override: string | null
  beingOverridden: boolean
  status: string
  payrollStatus: string | null
  payrollUse: string | null
  gpsid: string | null
  vin: string | null
  zid: string | null
  infosrc: string | null
  policySubfleet: string | null
  cardSubfleet: string | null
}

export type WexSyncResult = {
  received: number
  created: number
  updated: number
  unmatched: number
  customers: number
  transactions: number
}

export type WexTransaction = {
  transactionId: string
  carrierId: string
  companyXRef: string | null
  cardNumber: string
  transactionDate: string
  amount: number
  discountAmount: number
  merchantName: string | null
  merchantAddress: string | null
  merchantState: string | null
  gallons: number | null
  transactionType: string
  authorizationCode: string | null
  invoiceNumber: string | null
  contractId: number | null
  billingCurrency: string | null
  fundedTotal: number | null
  settledAmount: number | null
  preferredTotal: number | null
  feesTotal: number
  preDiscountTax: number | null
  postDiscountTax: number | null
  taxExemptAmount: number | null
  locationId: string | null
  merchantCity: string | null
  merchantZip: string | null
  merchantCountry: string | null
  merchantLatitude: string | null
  merchantLongitude: string | null
  entryMode: string | null
  handEntered: boolean
  originalTransactionId: string | null
  statementId: string | null
  promptValues: Array<{ type: string; value: string }>
  lineItems: WexTransactionLineItem[]
  taxes: WexTransactionTax[]
}

export type WexTransactionLineItem = {
  amount: number
  category: string | null
  discountAmount: number
  fuelType: string | null
  pricePerUnit: number | null
  productCode: string | null
  quantity: number
  retailPricePerUnit: number | null
  retailAmount: number | null
  serviceType: string | null
  taxes: WexTransactionTax[]
}

export type WexTransactionTax = {
  description: string | null
  amount: number
  taxClass: string | null
  taxCode: string | null
  exempt: boolean
}

export type WexCarrier = {
  carrierId: string
  name: string
}

export type WexContract = {
  contractId: number
  status: string
  description: string | null
  currency: string | null
  limitMethod: number
  masterContract: boolean
}

export type WexCreditLimits = {
  contractStatus: string
  transactionLimit: number
  originalLimit: number
  creditAvailable: number
  dailyLimit: number
  dailyAvailable: number
  totalAvailable: number
  maxMoneyCode: number
  unitOfMeasure: string | null
}

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

export type WexCardHeader = {
  companyXRef: string | null
  handEnter: string | null
  infoSource: string | null
  limitSource: string | null
  locationOverride: number
  locationSource: string | null
  overrideAllLocations: boolean
  originalStatus: string | null
  payrollStatus: string | null
  override: number
  policyNumber: number
  status: string | null
  timeSource: string | null
  lastUsedDate: string | null
  lastTransaction: number | null
  payrollUse: string | null
  payrollAtm: string | null
  payrollChk: string | null
  payrollAch: string | null
  payrollWire: string | null
  payrollDebit: string | null
}

export type WexCardV2 = {
  cardNumber: string
  header: WexCardHeader
  infos: Array<{
    infoId: string | null
    lengthCheck: boolean
    matchValue: string | null
    maximum: number
    minimum: number
    reportValue: string | null
    numericMatchValue: string | null
    validationType: string | null
    value: number
  }>
  limits: Array<{
    hours: number
    limit: number
    limitId: string | null
    minHours: number
    autoRollMap: number
    autoRollMax: number
  }>
  locationGroups: number[]
  locations: number[]
  timeRestrictions: Array<{
    beginTime: string | null
    day: number
    endTime: string | null
  }>
}

export type WexCardRefreshingLimits = {
  refreshingLimitSource: string
  dayCountLimit: number | null
  dayAmountLimit: number | null
  weekCountLimit: number | null
  weekAmountLimit: number | null
  monthCountLimit: number | null
  monthAmountLimit: number | null
}

export type WexAllowedOrderType = {
  orderType: number
  orderDescription: string
  defaultCardStyle: number
  defaultCardStyleDescription: string
  defaultPolicy: number
}

export type WexCardOrder = {
  policyNumber: number
  orderType: number
  cardStyle: number
  embossedName: string
  shipToFirst: string
  shipToLast: string
  shipToAddress1: string
  shipToAddress2: string
  shipToCity: string
  shipToState: string
  shipToZip: string
  shipToCountry: string
  shippingMethod: number
  rushProcessing: string
  cardCarrier: string
}

export type WexReplacementCardOrder = {
  cardNumber: string
  shipToFirst: string
  shipToLast: string
  shipToAddress1: string
  shipToAddress2: string
  shipToCity: string
  shipToState: string
  shipToZip: string
  shipToCountry: string
  shippingMethod: number
  rushProcessing: string
  reason: string
}

export type WexRequestStatus = {
  errorCode: number
  description: string | null
}

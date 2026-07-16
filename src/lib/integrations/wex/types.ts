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
}

export type WexCarrier = {
  carrierId: string
  name: string
}

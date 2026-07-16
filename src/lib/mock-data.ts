export type CustomerStatus = 'active' | 'pending' | 'suspended'
export type FuelCardStatus = 'active' | 'frozen' | 'pending' | 'cancelled'
export type TransactionStatus = 'approved' | 'declined' | 'flagged'
export type NoteEntityType = 'customer' | 'fuel_card'
export type ActivityEntityType = 'customer' | 'fuel_card' | 'application'
export type DocumentEntityType = 'customer' | 'fuel_card' | 'application'

export interface Customer {
  id: string
  contactName: string
  company: string
  email: string
  phone: string
  status: CustomerStatus
  creditLimit: number
  currentBalance: number
  monthlySpend: number
  lifetimeSpend: number
  address: string
  city: string
  state: string
  lastActivity: string
  createdAt: string
}

export interface Driver {
  id: string
  customerId: string
  name: string
  email: string
  phone: string
  status: 'active' | 'inactive'
  homeTerminal: string
  lastTransactionAt: string
}

export interface FuelCardRestriction {
  id: string
  fuelCardId: string
  allowedStates: string[]
  blockedStates: string[]
  allowedMerchants: string[]
  blockedMerchants: string[]
  fuelOnly: boolean
  defAllowed: boolean
  maintenanceAllowed: boolean
  timeWindow: string
}

export interface FuelCard {
  id: string
  customerId: string
  driverId: string | null
  provider: 'WEX' | 'Comdata' | 'FleetCor'
  last4: string
  status: FuelCardStatus
  dailyLimit: number
  monthlyLimit: number
  gallonLimit: number
  currentBalance: number
  issuedAt: string
  lastTransactionAt: string | null
}

export interface FuelTransaction {
  id: string
  customerId: string
  fuelCardId: string
  driverId: string | null
  merchant: string
  city: string
  state: string
  gallons: number
  amount: number
  status: TransactionStatus
  occurredAt: string
  category: 'diesel' | 'gasoline' | 'def' | 'maintenance'
}

export interface Note {
  id: string
  entityType: NoteEntityType
  entityId: string
  author: string
  body: string
  createdAt: string
}

export interface ActivityLog {
  id: string
  entityType: ActivityEntityType
  entityId: string
  title: string
  description: string
  createdAt: string
}

export interface Document {
  id: string
  entityType: DocumentEntityType
  entityId: string
  name: string
  type: 'agreement' | 'insurance' | 'tax' | 'statement' | 'receipt'
  status: 'verified' | 'pending' | 'expired'
  uploadedAt: string
}

export interface CustomerRecord extends Customer {
  drivers: Driver[]
  fuelCards: FuelCardRecord[]
  transactions: FuelTransactionRecord[]
  notes: Note[]
  activityLogs: ActivityLog[]
  documents: Document[]
}

export interface FuelCardRecord extends FuelCard {
  customer?: Customer
  driver?: Driver | null
  restriction?: FuelCardRestriction
  transactions?: FuelTransactionRecord[]
  notes?: Note[]
  activityLogs?: ActivityLog[]
}

export interface FuelTransactionRecord extends FuelTransaction {
  customer?: Customer
  driver?: Driver | null
  fuelCard?: FuelCard
}

export const customers: Customer[] = [
  {
    id: 'cus_abc',
    contactName: 'John Smith',
    company: 'ABC Logistics',
    email: 'john@abclogistics.com',
    phone: '(813) 601-7717',
    status: 'active',
    creditLimit: 75000,
    currentBalance: 4500,
    monthlySpend: 12480,
    lifetimeSpend: 145000,
    address: '1180 Commerce Park Dr',
    city: 'Tampa',
    state: 'FL',
    lastActivity: '2 hours ago',
    createdAt: '2025-10-24T14:30:00.000Z',
  },
  {
    id: 'cus_def',
    contactName: 'Sarah Jenkins',
    company: 'DEF Transport',
    email: 'sarah@deftransport.com',
    phone: '(404) 555-0194',
    status: 'active',
    creditLimit: 42000,
    currentBalance: 1200.5,
    monthlySpend: 5400,
    lifetimeSpend: 62000,
    address: '2400 Peachtree Industrial Blvd',
    city: 'Atlanta',
    state: 'GA',
    lastActivity: 'Yesterday',
    createdAt: '2025-11-12T09:12:00.000Z',
  },
  {
    id: 'cus_phd',
    contactName: 'Mike Ross',
    company: 'Pearson Hardman Delivery',
    email: 'mike@phdelivery.com',
    phone: '(212) 555-0161',
    status: 'suspended',
    creditLimit: 25000,
    currentBalance: 9800,
    monthlySpend: 0,
    lifetimeSpend: 15000,
    address: '601 Lexington Ave',
    city: 'New York',
    state: 'NY',
    lastActivity: '2 months ago',
    createdAt: '2025-08-02T16:45:00.000Z',
  },
  {
    id: 'cus_davis',
    contactName: 'Emily Davis',
    company: 'Davis Courier Services',
    email: 'emily@daviscourier.com',
    phone: '(615) 555-0137',
    status: 'pending',
    creditLimit: 18000,
    currentBalance: 0,
    monthlySpend: 0,
    lifetimeSpend: 0,
    address: '88 Music Row',
    city: 'Nashville',
    state: 'TN',
    lastActivity: '5 mins ago',
    createdAt: '2026-06-15T12:20:00.000Z',
  },
]

export const drivers: Driver[] = [
  { id: 'drv_alex', customerId: 'cus_abc', name: 'Alex Johnson', email: 'alex@abclogistics.com', phone: '(813) 555-0131', status: 'active', homeTerminal: 'Tampa, FL', lastTransactionAt: '2026-06-28T17:50:00.000Z' },
  { id: 'drv_maria', customerId: 'cus_abc', name: 'Maria Lopez', email: 'maria@abclogistics.com', phone: '(813) 555-0198', status: 'active', homeTerminal: 'Orlando, FL', lastTransactionAt: '2026-06-27T12:15:00.000Z' },
  { id: 'drv_bob', customerId: 'cus_def', name: 'Bob Vance', email: 'bob@deftransport.com', phone: '(404) 555-0188', status: 'active', homeTerminal: 'Atlanta, GA', lastTransactionAt: '2026-06-25T08:40:00.000Z' },
  { id: 'drv_nina', customerId: 'cus_def', name: 'Nina Patel', email: 'nina@deftransport.com', phone: '(404) 555-0175', status: 'active', homeTerminal: 'Savannah, GA', lastTransactionAt: '2026-06-26T19:05:00.000Z' },
  { id: 'drv_charlie', customerId: 'cus_davis', name: 'Charlie Kelly', email: 'charlie@daviscourier.com', phone: '(615) 555-0129', status: 'inactive', homeTerminal: 'Nashville, TN', lastTransactionAt: 'N/A' },
]

export const fuelCards: FuelCard[] = [
  { id: 'card_4021', customerId: 'cus_abc', driverId: 'drv_alex', provider: 'WEX', last4: '4021', status: 'active', dailyLimit: 500, monthlyLimit: 5000, gallonLimit: 120, currentBalance: 150, issuedAt: '2025-10-25T14:20:00.000Z', lastTransactionAt: '2026-06-28T17:50:00.000Z' },
  { id: 'card_8844', customerId: 'cus_abc', driverId: 'drv_maria', provider: 'Comdata', last4: '8844', status: 'active', dailyLimit: 650, monthlyLimit: 7500, gallonLimit: 160, currentBalance: 320, issuedAt: '2025-11-04T10:00:00.000Z', lastTransactionAt: '2026-06-27T12:15:00.000Z' },
  { id: 'card_9102', customerId: 'cus_def', driverId: 'drv_bob', provider: 'FleetCor', last4: '9102', status: 'frozen', dailyLimit: 300, monthlyLimit: 3000, gallonLimit: 80, currentBalance: 45, issuedAt: '2025-11-14T11:45:00.000Z', lastTransactionAt: '2026-06-25T08:40:00.000Z' },
  { id: 'card_2260', customerId: 'cus_def', driverId: 'drv_nina', provider: 'WEX', last4: '2260', status: 'active', dailyLimit: 400, monthlyLimit: 4200, gallonLimit: 100, currentBalance: 210, issuedAt: '2026-01-10T13:10:00.000Z', lastTransactionAt: '2026-06-26T19:05:00.000Z' },
  { id: 'card_1123', customerId: 'cus_davis', driverId: 'drv_charlie', provider: 'Comdata', last4: '1123', status: 'pending', dailyLimit: 200, monthlyLimit: 2000, gallonLimit: 50, currentBalance: 0, issuedAt: '2026-06-20T09:00:00.000Z', lastTransactionAt: null },
]

export const fuelCardRestrictions: FuelCardRestriction[] = [
  { id: 'res_4021', fuelCardId: 'card_4021', allowedStates: ['FL', 'GA', 'SC'], blockedStates: ['CA', 'NY'], allowedMerchants: ['Pilot', 'Love’s', 'Shell'], blockedMerchants: ['QuickMart'], fuelOnly: true, defAllowed: true, maintenanceAllowed: false, timeWindow: '4:00 AM - 10:00 PM' },
  { id: 'res_8844', fuelCardId: 'card_8844', allowedStates: ['FL', 'AL', 'GA'], blockedStates: [], allowedMerchants: ['TA', 'Pilot'], blockedMerchants: ['Circle K'], fuelOnly: true, defAllowed: true, maintenanceAllowed: true, timeWindow: '24 hours' },
  { id: 'res_9102', fuelCardId: 'card_9102', allowedStates: ['GA', 'TN'], blockedStates: ['FL'], allowedMerchants: ['Love’s'], blockedMerchants: ['Pilot', 'QuickMart'], fuelOnly: true, defAllowed: false, maintenanceAllowed: false, timeWindow: 'Frozen' },
  { id: 'res_2260', fuelCardId: 'card_2260', allowedStates: ['GA', 'NC', 'SC'], blockedStates: [], allowedMerchants: ['Shell', 'TA'], blockedMerchants: [], fuelOnly: true, defAllowed: true, maintenanceAllowed: false, timeWindow: '5:00 AM - 9:00 PM' },
  { id: 'res_1123', fuelCardId: 'card_1123', allowedStates: ['TN', 'KY'], blockedStates: [], allowedMerchants: ['Pilot'], blockedMerchants: [], fuelOnly: true, defAllowed: false, maintenanceAllowed: false, timeWindow: 'Pending activation' },
]

export const fuelTransactions: FuelTransaction[] = [
  { id: 'txn_1001', customerId: 'cus_abc', fuelCardId: 'card_4021', driverId: 'drv_alex', merchant: 'Pilot Travel Center', city: 'Ocala', state: 'FL', gallons: 68.4, amount: 312.42, status: 'approved', occurredAt: '2026-06-28T17:50:00.000Z', category: 'diesel' },
  { id: 'txn_1002', customerId: 'cus_abc', fuelCardId: 'card_8844', driverId: 'drv_maria', merchant: 'Love’s', city: 'Valdosta', state: 'GA', gallons: 54.2, amount: 246.8, status: 'approved', occurredAt: '2026-06-27T12:15:00.000Z', category: 'diesel' },
  { id: 'txn_1003', customerId: 'cus_def', fuelCardId: 'card_2260', driverId: 'drv_nina', merchant: 'Shell', city: 'Savannah', state: 'GA', gallons: 34.1, amount: 151.25, status: 'approved', occurredAt: '2026-06-26T19:05:00.000Z', category: 'diesel' },
  { id: 'txn_1004', customerId: 'cus_def', fuelCardId: 'card_9102', driverId: 'drv_bob', merchant: 'QuickMart', city: 'Tampa', state: 'FL', gallons: 0, amount: 85.49, status: 'declined', occurredAt: '2026-06-25T08:40:00.000Z', category: 'maintenance' },
  { id: 'txn_1005', customerId: 'cus_abc', fuelCardId: 'card_4021', driverId: 'drv_alex', merchant: 'Pilot Travel Center', city: 'Jacksonville', state: 'FL', gallons: 78.9, amount: 450.12, status: 'flagged', occurredAt: '2026-06-24T14:20:00.000Z', category: 'diesel' },
]

export const notes: Note[] = [
  { id: 'note_1', entityType: 'customer', entityId: 'cus_abc', author: 'Ops Team', body: 'Customer requested a temporary monthly limit review for July lanes.', createdAt: '2026-06-28T13:00:00.000Z' },
  { id: 'note_2', entityType: 'fuel_card', entityId: 'card_9102', author: 'Risk', body: 'Frozen after blocked merchant attempt in Florida.', createdAt: '2026-06-25T09:05:00.000Z' },
  { id: 'note_3', entityType: 'customer', entityId: 'cus_davis', author: 'Underwriting', body: 'Waiting on insurance certificate before activation.', createdAt: '2026-06-20T10:10:00.000Z' },
]

export const activityLogs: ActivityLog[] = [
  { id: 'act_1', entityType: 'customer', entityId: 'cus_abc', title: 'Limit review requested', description: 'ABC Logistics asked for a July temporary limit increase.', createdAt: '2026-06-28T13:00:00.000Z' },
  { id: 'act_2', entityType: 'fuel_card', entityId: 'card_9102', title: 'Card frozen', description: 'Card 9102 was frozen after a blocked merchant attempt.', createdAt: '2026-06-25T09:05:00.000Z' },
  { id: 'act_3', entityType: 'fuel_card', entityId: 'card_4021', title: 'Large fuel purchase', description: '$450.12 at Pilot Travel Center in Jacksonville.', createdAt: '2026-06-24T14:20:00.000Z' },
  { id: 'act_4', entityType: 'customer', entityId: 'cus_davis', title: 'Documents requested', description: 'Insurance certificate and bank letter requested.', createdAt: '2026-06-20T10:10:00.000Z' },
]

export const documents: Document[] = [
  { id: 'doc_1', entityType: 'customer', entityId: 'cus_abc', name: 'Fleet Credit Agreement.pdf', type: 'agreement', status: 'verified', uploadedAt: '2025-10-24T15:00:00.000Z' },
  { id: 'doc_2', entityType: 'customer', entityId: 'cus_davis', name: 'Insurance Certificate.pdf', type: 'insurance', status: 'pending', uploadedAt: '2026-06-20T09:45:00.000Z' },
  { id: 'doc_3', entityType: 'fuel_card', entityId: 'card_9102', name: 'Declined Attempt Receipt.pdf', type: 'receipt', status: 'verified', uploadedAt: '2026-06-25T09:15:00.000Z' },
]

export function currency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

export function getCustomerRecords(): CustomerRecord[] {
  return customers.map((customer) => {
    const customerDrivers = drivers.filter((driver) => driver.customerId === customer.id)
    const customerCards = fuelCards.filter((card) => card.customerId === customer.id)
    const customerTransactions = fuelTransactions.filter((transaction) => transaction.customerId === customer.id)

    return {
      ...customer,
      drivers: customerDrivers,
      fuelCards: customerCards.map(getFuelCardRecord),
      transactions: customerTransactions.map(getFuelTransactionRecord),
      notes: notes.filter((note) => note.entityType === 'customer' && note.entityId === customer.id),
      activityLogs: activityLogs.filter((log) => log.entityType === 'customer' && log.entityId === customer.id),
      documents: documents.filter((document) => document.entityType === 'customer' && document.entityId === customer.id),
    }
  })
}

export function getCustomerRecord(id: string) {
  return getCustomerRecords().find((customer) => customer.id === id)
}

export function getFuelCardRecords(): FuelCardRecord[] {
  return fuelCards.map(getFuelCardRecord)
}

export function getFuelCardRecord(card: FuelCard | string): FuelCardRecord {
  const fuelCard = typeof card === 'string' ? fuelCards.find((item) => item.id === card)! : card
  const customer = customers.find((item) => item.id === fuelCard.customerId)
  const driver = fuelCard.driverId ? drivers.find((item) => item.id === fuelCard.driverId) ?? null : null

  return {
    ...fuelCard,
    customer,
    driver,
    restriction: fuelCardRestrictions.find((restriction) => restriction.fuelCardId === fuelCard.id),
    transactions: fuelTransactions
      .filter((transaction) => transaction.fuelCardId === fuelCard.id)
      .map(getFuelTransactionRecord),
    notes: notes.filter((note) => note.entityType === 'fuel_card' && note.entityId === fuelCard.id),
    activityLogs: activityLogs.filter((log) => log.entityType === 'fuel_card' && log.entityId === fuelCard.id),
  }
}

export function getFuelTransactionRecord(transaction: FuelTransaction): FuelTransactionRecord {
  const customer = customers.find((item) => item.id === transaction.customerId)
  const fuelCard = fuelCards.find((item) => item.id === transaction.fuelCardId)
  const driver = transaction.driverId ? drivers.find((item) => item.id === transaction.driverId) ?? null : null

  return {
    ...transaction,
    customer,
    fuelCard,
    driver,
  }
}

export function getDashboardOverview() {
  const customerRecords = getCustomerRecords()
  const cardRecords = getFuelCardRecords()

  return {
    totalCustomers: customers.length,
    activeCustomers: customers.filter((customer) => customer.status === 'active').length,
    pendingCustomers: customers.filter((customer) => customer.status === 'pending').length,
    suspendedCustomers: customers.filter((customer) => customer.status === 'suspended').length,
    activeFuelCards: fuelCards.filter((card) => card.status === 'active').length,
    frozenFuelCards: fuelCards.filter((card) => card.status === 'frozen').length,
    monthlySpend: customers.reduce((total, customer) => total + customer.monthlySpend, 0),
    outstandingBalance: customers.reduce((total, customer) => total + customer.currentBalance, 0),
    recentTransactions: fuelTransactions
      .map(getFuelTransactionRecord)
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 5),
    recentActivity: activityLogs
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6),
    cardsNeedingAttention: cardRecords.filter((card) =>
      card.status === 'frozen' ||
      card.status === 'pending' ||
      card.transactions?.some((transaction) => transaction.status !== 'approved')
    ),
    customerRecords,
    cardRecords,
  }
}

export const mockCustomers = getCustomerRecords()
export const mockFuelCards = getFuelCardRecords()

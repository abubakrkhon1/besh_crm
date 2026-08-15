import type { WexCreditLimits } from './types'

const closedStatus = /closed|inactive|terminated|deleted/i

export function calculateAccountCreditKpis(limits: WexCreditLimits[]) {
  const openLimits = limits.filter((limit) => !closedStatus.test(limit.contractStatus))
  const creditLimit = openLimits.reduce((sum, limit) => sum + limit.originalLimit, 0)
  const creditAvailable = openLimits.reduce((sum, limit) => sum + limit.creditAvailable, 0)

  return {
    creditLimit: roundCurrency(creditLimit),
    currentBalance: roundCurrency(Math.max(0, creditLimit - creditAvailable)),
  }
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

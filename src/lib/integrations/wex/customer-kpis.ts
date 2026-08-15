export type CustomerSpendTotals = Map<string, { monthlySpend: number; lifetimeSpend: number }>

type SpendTransaction = {
  customer_id: string
  amount: number | string
  transaction_date: string
}

export function accumulateCustomerSpend(
  totals: CustomerSpendTotals,
  transactions: SpendTransaction[],
  monthStartIso: string,
) {
  for (const transaction of transactions) {
    const current = totals.get(transaction.customer_id) ?? { monthlySpend: 0, lifetimeSpend: 0 }
    const amount = Number(transaction.amount)
    if (!Number.isFinite(amount)) continue

    current.lifetimeSpend += amount
    if (transaction.transaction_date >= monthStartIso) current.monthlySpend += amount
    totals.set(transaction.customer_id, current)
  }

  return totals
}

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export const TABLE_PAGE_SIZES = [10, 25, 50, 100] as const

export function getTablePageSize(value: unknown, fallback = 25) {
  const parsed = Number(value)
  return (TABLE_PAGE_SIZES as readonly number[]).includes(parsed) ? parsed : fallback
}

export type DateTimeVariant = 'default' | 'short' | 'compact' | 'date'

const optionsByVariant: Record<DateTimeVariant, Intl.DateTimeFormatOptions> = {
  default: { dateStyle: 'medium', timeStyle: 'short' },
  short: { dateStyle: 'short', timeStyle: 'short' },
  compact: { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  date: { dateStyle: 'medium' },
}

export function formatDateTime(
  value: string | Date,
  { locale = 'en-US', timeZone, variant = 'default' }: {
    locale?: string
    timeZone?: string
    variant?: DateTimeVariant
  } = {},
) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'Invalid date'

  return new Intl.DateTimeFormat(locale, {
    ...optionsByVariant[variant],
    ...(timeZone ? { timeZone } : {}),
  }).format(date)
}

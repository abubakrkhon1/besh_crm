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

const localDateTimePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

export function isValidLocalDateTime(value: string) {
  const match = localDateTimePattern.exec(value)
  if (!match) return false

  const [, yearText, monthText, dayText, hourText, minuteText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  if (year < 2000 || year > 2100 || hour > 23 || minute > 59) return false

  const normalized = new Date(Date.UTC(year, month - 1, day, hour, minute))
  return normalized.getUTCFullYear() === year
    && normalized.getUTCMonth() === month - 1
    && normalized.getUTCDate() === day
    && normalized.getUTCHours() === hour
    && normalized.getUTCMinutes() === minute
}

export function localDateTimeToIso(value: string, timezoneOffsetMinutes: number) {
  if (!value) return null
  if (!isValidLocalDateTime(value) || !Number.isInteger(timezoneOffsetMinutes) || Math.abs(timezoneOffsetMinutes) > 840) {
    return undefined
  }

  const match = localDateTimePattern.exec(value)!
  const [, yearText, monthText, dayText, hourText, minuteText] = match
  const localAsUtc = Date.UTC(
    Number(yearText),
    Number(monthText) - 1,
    Number(dayText),
    Number(hourText),
    Number(minuteText),
  )

  return new Date(localAsUtc + timezoneOffsetMinutes * 60_000).toISOString()
}

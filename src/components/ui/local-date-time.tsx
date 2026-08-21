'use client'

import { useSyncExternalStore } from 'react'
import { formatDateTime, type DateTimeVariant } from '@/lib/date-time'

const subscribe = () => () => {}

export function LocalDateTime({
  value,
  variant = 'default',
  className,
}: {
  value: string | Date
  variant?: DateTimeVariant
  className?: string
}) {
  const isoValue = value instanceof Date ? value.toISOString() : value
  const serverValue = formatDateTime(isoValue, { timeZone: 'UTC', variant })
  const localValue = useSyncExternalStore(
    subscribe,
    () => formatDateTime(isoValue, { variant }),
    () => serverValue,
  )

  return <time className={className} dateTime={isoValue}>{localValue}</time>
}

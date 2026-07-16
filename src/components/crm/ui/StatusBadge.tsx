import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export type BadgeStatus = 'success' | 'danger' | 'pending' | 'info' | 'default'

interface StatusBadgeProps {
  status: BadgeStatus
  label: string
  className?: string
}

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const statusStyles: Record<BadgeStatus, string> = {
    success: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    danger: 'border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300',
    pending: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    info: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    default: 'border-border bg-muted text-muted-foreground',
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        'h-5 rounded-full px-2 font-medium',
        statusStyles[status],
        className
      )}
    >
      {label}
    </Badge>
  )
}

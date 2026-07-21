import { cn } from '@/lib/utils'
import { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'

interface MetricCardProps {
  title: string
  value: string | number
  icon?: ReactNode
  trend?: {
    value: number
    isPositive: boolean
  }
  className?: string
  onClick?: () => void
}

export function MetricCard({ title, value, icon, trend, className, onClick }: MetricCardProps) {
  return (
    <Card
      onClick={onClick}
      className={cn(
        'group min-w-[180px] rounded-lg py-0 transition-colors duration-200',
        onClick && 'cursor-pointer hover:bg-muted/30',
        className
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.025em] text-muted-foreground">{title}</h3>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-[26px] font-bold tracking-tight text-foreground">{value}</span>
              {trend && (
                <span
                  className={cn(
                    'text-xs font-medium',
                    trend.isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  )}
                >
                  {trend.isPositive ? '+' : ''}{trend.value}%
                </span>
              )}
            </div>
          </div>
          {icon && (
            <div className="flex size-[34px] items-center justify-center rounded-md bg-primary p-2 text-primary-foreground">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

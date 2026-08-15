'use client'

import { Label, Pie, PieChart } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

type StatusDatum = { status: string; count: number }

const chartConfig = {
  transactions: { label: 'Transactions' },
  posted: { label: 'Posted', color: 'var(--success)' },
  pending: { label: 'Pending', color: 'var(--pending)' },
  reversed: { label: 'Reversed', color: 'var(--destructive)' },
  declined: { label: 'Declined', color: 'var(--chart-5)' },
  other: { label: 'Other', color: 'var(--chart-1)' },
} satisfies ChartConfig

export function TransactionStatusChart({ statuses }: { statuses: StatusDatum[] }) {
  const total = statuses.reduce((sum, item) => sum + item.count, 0)
  const data = statuses.map((item) => {
    const status = normalizeStatus(item.status)
    return {
      status,
      transactions: item.count,
      fill: `var(--color-${status in chartConfig ? status : 'other'})`,
    }
  })

  if (!total) return <p className="py-10 text-center text-sm text-muted-foreground">No transactions in this period.</p>

  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-3">
      <ChartContainer config={chartConfig} className="h-32 w-full aspect-auto">
        <PieChart accessibilityLayer>
          <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="status" />} />
          <Pie data={data} dataKey="transactions" nameKey="status" innerRadius={36} outerRadius={54} strokeWidth={2}>
            <Label content={({ viewBox }) => {
              if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null
              return (
                <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 3} className="fill-foreground text-lg font-bold">{total.toLocaleString()}</tspan>
                  <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 13} className="fill-muted-foreground text-[9px]">Total</tspan>
                </text>
              )
            }} />
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="flex min-w-0 flex-col gap-2">
        {data.map((item) => (
          <div key={item.status} className="flex min-w-0 items-center gap-2 text-xs">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.fill }} aria-hidden="true" />
            <span className="min-w-0 flex-1 capitalize">{item.status.replaceAll('_', ' ')}</span>
            <span className="shrink-0 font-medium tabular-nums">{item.transactions.toLocaleString()} ({formatPercent(item.transactions / total)})</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function normalizeStatus(status: string) {
  return status.trim().toLowerCase().replaceAll(' ', '_')
}

function formatPercent(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 }).format(value)
}

'use client'

import { Label, Pie, PieChart } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

type StatusDatum = { status: string; count: number }

const chartConfig = {
  cards: { label: 'Cards' },
  active: { label: 'Active', color: 'var(--chart-2)' },
  frozen: { label: 'Frozen', color: 'var(--chart-3)' },
  inactive: { label: 'Inactive', color: 'var(--muted-foreground)' },
  pending: { label: 'Pending', color: 'var(--chart-4)' },
  other: { label: 'Other', color: 'var(--chart-1)' },
} satisfies ChartConfig

export function FuelCardStatusChart({ statuses }: { statuses: StatusDatum[] }) {
  const total = statuses.reduce((sum, item) => sum + item.count, 0)
  const data = statuses.map((item) => {
    const normalizedStatus = normalizeStatus(item.status)
    return {
      status: normalizedStatus,
      cards: item.count,
      fill: `var(--color-${normalizedStatus in chartConfig ? normalizedStatus : 'other'})`,
    }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Card status distribution</CardTitle>
        <CardDescription>Current WEX/EFS card inventory.</CardDescription>
      </CardHeader>
      <CardContent>
        {total ? (
          <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-3">
            <ChartContainer config={chartConfig} className="h-40 w-full aspect-auto">
              <PieChart accessibilityLayer>
                <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="status" />} />
                <Pie data={data} dataKey="cards" nameKey="status" innerRadius={42} outerRadius={64} strokeWidth={3}>
                  <Label content={({ viewBox }) => {
                    if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null
                    return (
                      <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                        <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 4} className="fill-foreground text-xl font-bold">{total.toLocaleString()}</tspan>
                        <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 14} className="fill-muted-foreground text-[9px]">Total cards</tspan>
                      </text>
                    )
                  }} />
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="flex min-w-0 flex-col gap-2.5">
              {data.map((item) => (
                <div key={item.status} className="flex min-w-0 items-center gap-2 text-xs">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.fill }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 capitalize">{item.status.replaceAll('_', ' ')}</span>
                  <span className="shrink-0 font-medium tabular-nums">{item.cards.toLocaleString()} ({Math.round((item.cards / total) * 100)}%)</span>
                </div>
              ))}
            </div>
          </div>
        ) : <p className="py-12 text-center text-sm text-muted-foreground">No synchronized fuel cards.</p>}
      </CardContent>
    </Card>
  )
}

function normalizeStatus(status: string) {
  return status.trim().toLowerCase().replaceAll(' ', '_')
}

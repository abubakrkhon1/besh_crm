'use client'

import { Label, Pie, PieChart } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export type SalesManagerLeadCounts = {
  new: number
  on_the_process: number
  follow_up: number
  successful: number
  deal_lost: number
}

const chartConfig = {
  leads: { label: 'Leads' },
  new: { label: 'New', color: 'var(--chart-1)' },
  on_the_process: { label: 'On the Process', color: 'var(--chart-3)' },
  follow_up: { label: 'Follow Up', color: 'var(--chart-4)' },
  successful: { label: 'Successful', color: 'var(--chart-2)' },
  deal_lost: { label: 'Deal Lost', color: 'var(--destructive)' },
} satisfies ChartConfig

const statusLabels: Record<keyof SalesManagerLeadCounts, string> = {
  new: 'New',
  on_the_process: 'On the Process',
  follow_up: 'Follow Up',
  successful: 'Successful',
  deal_lost: 'Deal Lost',
}

export function SalesManagerLeadDistribution({ counts }: { counts: SalesManagerLeadCounts }) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const chartData = (Object.keys(counts) as Array<keyof SalesManagerLeadCounts>).map((status) => ({
    status,
    leads: counts[status],
    fill: `var(--color-${status})`,
  }))

  return (
    <Card className="h-full min-h-[286px]">
      <CardHeader>
        <CardTitle>Lead distribution</CardTitle>
        <CardDescription>Current pipeline status, independent of the performance period.</CardDescription>
      </CardHeader>
      <CardContent className="grid min-h-0 flex-1 items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.8fr)]">
        {total ? (
          <>
            <ChartContainer config={chartConfig} className="mx-auto h-[190px] w-full max-w-[230px] aspect-auto">
              <PieChart accessibilityLayer>
                <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="status" />} />
                <Pie data={chartData} dataKey="leads" nameKey="status" innerRadius={55} outerRadius={78} strokeWidth={3}>
                  <Label
                    content={({ viewBox }) => {
                      if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null

                      return (
                        <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                          <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 5} className="fill-foreground text-xl font-bold">{total.toLocaleString()}</tspan>
                          <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 15} className="fill-muted-foreground text-[11px]">Total leads</tspan>
                        </text>
                      )
                    }}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="flex flex-col gap-2.5">
              {chartData.map((item) => (
                <div key={item.status} className="flex items-center gap-2.5 text-xs">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.fill }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-medium">{statusLabels[item.status]}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {item.leads} ({Math.round((item.leads / total) * 100)}%)
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex h-[190px] items-center justify-center text-sm text-muted-foreground sm:col-span-2">No leads are currently assigned.</div>
        )}
      </CardContent>
    </Card>
  )
}

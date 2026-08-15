'use client'

import { Label, Pie, PieChart } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export type OwnershipDatum = { id: string; name: string; value: number; color: string }

const chartConfig = { value: { label: 'Assigned leads' } } satisfies ChartConfig

export function SalesRepOwnershipChart({ data }: { data: OwnershipDatum[] }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  return (
    <Card className="h-full min-w-0 py-0">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="text-sm">Lead Ownership (Assigned Leads)</CardTitle>
        <CardAction><span className="rounded-md bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">Selected Period</span></CardAction>
      </CardHeader>
      <CardContent className="grid min-h-[264px] items-center gap-4 p-4 sm:grid-cols-[minmax(180px,1fr)_minmax(150px,.8fr)]">
        {total ? <>
          <ChartContainer config={chartConfig} className="mx-auto h-[210px] w-full max-w-[250px] aspect-auto">
            <PieChart accessibilityLayer>
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Pie data={data.map((item) => ({ ...item, fill: item.color }))} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} strokeWidth={2}>
                <Label content={({ viewBox }) => viewBox && 'cx' in viewBox && 'cy' in viewBox ? (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 5} className="fill-foreground text-xl font-bold">{total}</tspan>
                    <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 16} className="fill-muted-foreground text-[11px]">Total leads</tspan>
                  </text>
                ) : null} />
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="flex flex-col gap-3">
            {data.map((item) => <div key={item.id} className="flex items-center gap-2 text-xs">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{item.value} ({Math.round(item.value / total * 100)}%)</span>
            </div>)}
          </div>
        </> : <div className="flex h-52 items-center justify-center text-sm text-muted-foreground sm:col-span-2">No assigned leads in this period.</div>}
      </CardContent>
    </Card>
  )
}

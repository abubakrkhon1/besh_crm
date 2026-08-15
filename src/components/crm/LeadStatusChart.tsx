'use client'

import { Label, Pie, PieChart } from 'recharts'

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type LeadStatusCounts = {
  new: number
  successful: number
  deal_lost: number
  on_the_process: number
  follow_up: number
}

const chartConfig = {
  leads: {
    label: 'Leads',
  },
  new: {
    label: 'New',
    color: 'var(--primary)',
  },
  successful: {
    label: 'Successful',
    color: 'var(--success)',
  },
  deal_lost: {
    label: 'Deal Lost',
    color: 'var(--destructive)',
  },
  on_the_process: {
    label: 'On the Process',
    color: 'var(--pending)',
  },
  follow_up: {
    label: 'Follow Up',
    color: 'var(--chart-4)',
  },
} satisfies ChartConfig

export function LeadStatusChart({ counts }: { counts: LeadStatusCounts }) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const chartData = [
    { status: 'new', leads: counts.new, fill: 'var(--color-new)' },
    { status: 'on_the_process', leads: counts.on_the_process, fill: 'var(--color-on_the_process)' },
    { status: 'follow_up', leads: counts.follow_up, fill: 'var(--color-follow_up)' },
    { status: 'successful', leads: counts.successful, fill: 'var(--color-successful)' },
    { status: 'deal_lost', leads: counts.deal_lost, fill: 'var(--color-deal_lost)' },
  ]

  return (
    <Card className="h-[300px]">
      <CardHeader>
        <CardTitle>Lead status</CardTitle>
        <CardDescription>Current distribution across your pipeline.</CardDescription>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 items-center justify-center">
        <ChartContainer
          config={chartConfig}
          className="mx-auto h-full w-full max-w-md aspect-auto"
        >
          <PieChart accessibilityLayer>
            <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="status" />} />
            <Pie
              data={chartData}
              dataKey="leads"
              nameKey="status"
              innerRadius={40}
              outerRadius={64}
              strokeWidth={4}
            >
              <Label
                content={({ viewBox }) => {
                  if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null

                  return (
                    <text
                      x={viewBox.cx}
                      y={viewBox.cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy ?? 0) - 30}
                        className="fill-foreground text-2xl font-bold"
                      >
                        {total.toLocaleString()}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy ?? 0) - 12}
                        className="fill-muted-foreground text-xs"
                      >
                        {total === 1 ? 'Lead' : 'Leads'}
                      </tspan>
                    </text>
                  )
                }}
              />
            </Pie>
            <ChartLegend
              content={
                <ChartLegendContent
                  nameKey="status"
                  className="flex-wrap gap-x-4 gap-y-2"
                />
              }
            />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

'use client'

import { Label, Line, LineChart, Pie, PieChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export type DailyDashboardPoint = {
  date: string
  gallons: number
  spending: number
}

export type SpendByStatePoint = {
  state: string
  amount: number
}

const salesChartConfig = {
  gallons: {
    label: 'Gallons sold',
    color: 'var(--chart-1)',
  },
  spending: {
    label: 'Spending',
    color: 'var(--chart-2)',
  },
} satisfies ChartConfig

const distributionChartConfig = {
  amount: {
    label: 'Spend',
  },
} satisfies ChartConfig

const chartColors = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']

export function SalesOverviewChart({ data }: { data: DailyDashboardPoint[] }) {
  return (
    <Card className="h-full min-h-[330px] shadow-sm">
      <CardHeader>
        <CardTitle>Sales overview</CardTitle>
        <CardDescription>Daily gallons and fuel spending in the selected range.</CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        {data.length ? (
          <ChartContainer config={salesChartConfig} className="h-[240px] w-full aspect-auto">
            <LineChart accessibilityLayer data={data} margin={{ left: 4, right: 12, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tickMargin={10}
                minTickGap={24}
                tickFormatter={formatChartDate}
              />
              <YAxis yAxisId="gallons" axisLine={false} tickLine={false} width={42} tickFormatter={formatCompactNumber} />
              <YAxis yAxisId="spending" orientation="right" axisLine={false} tickLine={false} width={48} tickFormatter={formatCompactCurrency} />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => formatLongDate(String(value))}
                    formatter={(value, name) => (
                      <div className="flex min-w-36 items-center justify-between gap-4">
                        <span className="text-muted-foreground">{salesChartConfig[name as keyof typeof salesChartConfig]?.label}</span>
                        <span className="font-mono font-medium tabular-nums">
                          {name === 'spending' ? formatCurrency(Number(value)) : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} gal`}
                        </span>
                      </div>
                    )}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Line yAxisId="gallons" type="monotone" dataKey="gallons" stroke="var(--color-gallons)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              <Line yAxisId="spending" type="monotone" dataKey="spending" stroke="var(--color-spending)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ChartContainer>
        ) : (
          <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">No transactions in this date range.</div>
        )}
      </CardContent>
    </Card>
  )
}

export function SpendByStateChart({ data, total }: { data: SpendByStatePoint[]; total: number }) {
  const topStates = data.slice(0, 4)
  const otherAmount = data.slice(4).reduce((sum, item) => sum + item.amount, 0)
  const groupedData = [...topStates, ...(otherAmount > 0 ? [{ state: 'Other', amount: otherAmount }] : [])]
    .map((item, index) => ({ ...item, fill: chartColors[index % chartColors.length] }))

  return (
    <Card className="h-full min-h-[330px] shadow-sm">
      <CardHeader>
        <CardTitle>Spend by state</CardTitle>
        <CardDescription>Where fuel spending occurred in the selected range.</CardDescription>
      </CardHeader>
      <CardContent className="grid min-h-0 flex-1 items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(130px,0.8fr)]">
        {groupedData.length ? (
          <>
            <ChartContainer config={distributionChartConfig} className="mx-auto h-[210px] w-full max-w-[240px] aspect-auto">
              <PieChart accessibilityLayer>
                <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="state" formatter={(value) => formatCurrency(Number(value))} />} />
                <Pie data={groupedData} dataKey="amount" nameKey="state" innerRadius={58} outerRadius={82} strokeWidth={3}>
                  <Label
                    content={({ viewBox }) => {
                      if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null

                      return (
                        <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                          <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 7} className="fill-muted-foreground text-[11px]">Total spend</tspan>
                          <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 15} className="fill-foreground text-base font-bold">{formatCompactCurrency(total)}</tspan>
                        </text>
                      )
                    }}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="flex flex-col gap-3">
              {groupedData.map((item) => (
                <div key={item.state} className="flex items-start gap-2.5">
                  <span className="mt-1 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.fill }} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{item.state}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(item.amount)}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex h-[210px] items-center justify-center text-sm text-muted-foreground sm:col-span-2">No spending in this date range.</div>
        )}
      </CardContent>
    </Card>
  )
}

function formatChartDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function formatLongDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
}

'use client'

import { Area, AreaChart, CartesianGrid, Label, Pie, PieChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

const applicationConfig = {
  applications: { label: 'Applications' },
  pending: { label: 'Pending', color: 'var(--chart-4)' },
  approved: { label: 'Approved', color: 'var(--chart-2)' },
  denied: { label: 'Denied', color: 'var(--destructive)' },
} satisfies ChartConfig

export function ApplicationPipelineChart({ counts }: { counts: { pending: number; approved: number; denied: number } }) {
  const data = Object.entries(counts).map(([status, applications]) => ({ status, applications, fill: `var(--color-${status})` }))
  const total = data.reduce((sum, item) => sum + item.applications, 0)

  return <div className="flex justify-center">
    <ChartContainer config={applicationConfig} className="h-40 w-40 aspect-auto">
      <PieChart accessibilityLayer>
        <ChartTooltip content={<ChartTooltipContent hideLabel nameKey="status" />} />
        <Pie data={data} dataKey="applications" nameKey="status" innerRadius={40} outerRadius={62} strokeWidth={3}>
          <Label content={({ viewBox }) => {
            if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null
            return <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle"><tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 4} className="fill-foreground text-xl font-bold">{total}</tspan><tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 14} className="fill-muted-foreground text-[9px]">Total</tspan></text>
          }} />
        </Pie>
      </PieChart>
    </ChartContainer>
  </div>
}

const customerConfig = {
  customers: { label: 'Customers' },
  active: { label: 'Active', color: 'var(--chart-2)' },
  pending: { label: 'Pending', color: 'var(--chart-4)' },
  inactive: { label: 'Inactive', color: 'var(--muted-foreground)' },
  suspended: { label: 'Suspended', color: 'var(--destructive)' },
  other: { label: 'Other', color: 'var(--chart-1)' },
} satisfies ChartConfig

export function CustomerHealthChart({ counts }: { counts: Array<{ status: string; count: number }> }) {
  const total = counts.reduce((sum, item) => sum + item.count, 0)
  const data = counts.map((item) => ({ ...item, fill: `var(--color-${item.status in customerConfig ? item.status : 'other'})` }))
  return <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3">
    <ChartContainer config={customerConfig} className="h-32 w-full aspect-auto">
      <PieChart accessibilityLayer><ChartTooltip content={<ChartTooltipContent hideLabel nameKey="status" />} /><Pie data={data} dataKey="count" nameKey="status" innerRadius={34} outerRadius={52} strokeWidth={3}><Label content={({ viewBox }) => {
        if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null
        return <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle"><tspan x={viewBox.cx} y={(viewBox.cy ?? 0) - 3} className="fill-foreground text-lg font-bold">{total}</tspan><tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 12} className="fill-muted-foreground text-[8px]">Total</tspan></text>
      }} /></Pie></PieChart>
    </ChartContainer>
    <div className="flex min-w-0 flex-col gap-2">{data.map((item) => <div key={item.status} className="flex items-center gap-2 text-[11px]"><span className="size-2 rounded-full" style={{ backgroundColor: item.fill }} /><span className="flex-1 capitalize text-muted-foreground">{item.status}</span><span className="font-semibold tabular-nums">{item.count} ({total ? Math.round(item.count / total * 100) : 0}%)</span></div>)}</div>
  </div>
}

const spendConfig = { amount: { label: 'Spend', color: 'var(--chart-1)' } } satisfies ChartConfig

export function CustomerSpendTrend({ data }: { data: Array<{ date: string; amount: number }> }) {
  return <ChartContainer config={spendConfig} className="h-52 w-full aspect-auto">
    <AreaChart data={data} margin={{ left: 4, right: 8, top: 10 }}>
      <defs><linearGradient id="customer-spend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-amount)" stopOpacity={0.35}/><stop offset="95%" stopColor="var(--color-amount)" stopOpacity={0.03}/></linearGradient></defs>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={28} tickFormatter={(value) => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} />
      <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(value) => `$${Number(value) >= 1_000 ? `${Math.round(Number(value) / 1_000)}K` : value}`} />
      <ChartTooltip content={<ChartTooltipContent labelFormatter={(value) => new Date(`${value}T00:00:00`).toLocaleDateString()} />} />
      <Area dataKey="amount" type="monotone" fill="url(#customer-spend-fill)" stroke="var(--color-amount)" strokeWidth={2} />
    </AreaChart>
  </ChartContainer>
}

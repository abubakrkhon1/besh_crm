import Link from 'next/link'
import { Ellipsis, Users } from 'lucide-react'
import { LeadWithRepresentative } from '@/app/actions/leads'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Profile } from '@/types/database.types'

export type RepresentativePerformance = {
  representative: Profile
  total: number
  accepted: number
  successful: number
  conversionRate: number
  estimatedGallons: number
  lastActivity: string | null
}

export function buildRepresentativePerformance(
  representatives: Profile[],
  leads: LeadWithRepresentative[],
): RepresentativePerformance[] {
  return representatives.map((representative) => {
    const representativeLeads = leads.filter((lead) => lead.assigned_to_profile_id === representative.id)
    const successful = representativeLeads.filter((lead) => lead.status === 'successful').length
    const accepted = representativeLeads.filter((lead) => !['new', 'deal_lost'].includes(lead.status)).length
    const lastActivity = representativeLeads
      .map((lead) => lead.updated_at)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null

    return {
      representative,
      total: representativeLeads.length,
      accepted,
      successful,
      conversionRate: representativeLeads.length
        ? Math.round((successful / representativeLeads.length) * 1000) / 10
        : 0,
      estimatedGallons: representativeLeads.reduce((sum, lead) => sum + Number(lead.estimated_monthly_gallons ?? 0), 0),
      lastActivity,
    }
  }).sort((a, b) => b.successful - a.successful || b.total - a.total)
}

export function SalesRepresentativesTable({ performance }: { performance: RepresentativePerformance[] }) {
  return (
    <Card className="min-w-0 py-0">
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary"><Users className="size-4" /></span>
          Sales Agent Performance
        </CardTitle>
        <CardAction>
          <Link href="/crm/leads" className="text-xs font-medium text-primary hover:underline">View full report →</Link>
        </CardAction>
      </CardHeader>
      <CardContent className="overflow-x-auto px-0">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead>Sales agent</TableHead>
              <TableHead>Region</TableHead>
              <TableHead className="text-right">Total leads</TableHead>
              <TableHead className="text-right">Accepted</TableHead>
              <TableHead className="text-right">Inserted</TableHead>
              <TableHead className="text-right">Conversion</TableHead>
              <TableHead className="text-right">Est. gallons</TableHead>
              <TableHead>Last activity</TableHead>
              <TableHead className="w-8"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {performance.length ? performance.map((row) => {
              const name = row.representative.full_name ?? row.representative.email ?? 'Unnamed sales agent'
              return (
                <TableRow key={row.representative.id}>
                  <TableCell>
                    <Link href={`/crm/leads?rep=${row.representative.id}`} className="flex items-center gap-2 font-medium hover:underline">
                      <Avatar className="size-7"><AvatarFallback className="bg-primary text-[10px] font-semibold text-primary-foreground">{initials(name)}</AvatarFallback></Avatar>
                      <span className="max-w-36 truncate">{name}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.representative.department ?? 'Unassigned'}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{row.total}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.accepted}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.successful}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{row.conversionRate}%</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatCompact(row.estimatedGallons)}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{row.lastActivity ? formatActivityDate(row.lastActivity) : 'No activity'}</TableCell>
                  <TableCell><Ellipsis className="size-4 text-muted-foreground" aria-hidden="true" /></TableCell>
                </TableRow>
              )
            }) : (
              <TableRow><TableCell colSpan={9} className="h-40 text-center text-muted-foreground">No sales agents are available yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

export const initials = (name: string) => name.split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')

const formatCompact = (value: number) => value >= 1_000 ? `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)}K` : value.toLocaleString()

const formatActivityDate = (value: string) => new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
}).format(new Date(value))

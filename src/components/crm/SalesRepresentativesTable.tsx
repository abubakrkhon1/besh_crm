import Link from 'next/link'
import { LeadWithRepresentative } from '@/app/actions/leads'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Profile } from '@/types/database.types'

export type RepresentativePerformance = {
  representative: Profile
  total: number
  newLeads: number
  accepted: number
  rejected: number
  inserted: number
  conversionRate: number
}

export function buildRepresentativePerformance(
  representatives: Profile[],
  leads: LeadWithRepresentative[]
): RepresentativePerformance[] {
  return representatives.map((representative) => {
    const representativeLeads = leads.filter((lead) => lead.assigned_to_profile_id === representative.id)
    const inserted = representativeLeads.filter((lead) => lead.status === 'inserted_into_crm').length

    return {
      representative,
      total: representativeLeads.length,
      newLeads: representativeLeads.filter((lead) => lead.status === 'new').length,
      accepted: representativeLeads.filter((lead) => ['accepted', 'inserted_into_crm'].includes(lead.status)).length,
      rejected: representativeLeads.filter((lead) => lead.status === 'rejected').length,
      inserted,
      conversionRate: representativeLeads.length
        ? Math.round((inserted / representativeLeads.length) * 1000) / 10
        : 0,
    }
  }).sort((a, b) => b.total - a.total)
}

export function SalesRepresentativesTable({ performance }: { performance: RepresentativePerformance[] }) {
  return (
    <Card className="overflow-hidden py-0">
      <Table>
        <TableHeader className="bg-muted/45">
          <TableRow>
            <TableHead>Representative</TableHead>
            <TableHead>Total leads</TableHead>
            <TableHead>New</TableHead>
            <TableHead>Accepted</TableHead>
            <TableHead>Rejected</TableHead>
            <TableHead>In CRM</TableHead>
            <TableHead>Conversion</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {performance.length ? performance.map((row) => (
            <TableRow key={row.representative.id}>
              <TableCell>
                <Link href={`/crm/leads?rep=${row.representative.id}`} className="font-medium hover:underline">
                  {row.representative.full_name ?? row.representative.email ?? 'Unnamed representative'}
                </Link>
                {row.representative.full_name && row.representative.email && (
                  <p className="text-sm text-muted-foreground">{row.representative.email}</p>
                )}
              </TableCell>
              <TableCell className="font-medium">{row.total}</TableCell>
              <TableCell>{row.newLeads}</TableCell>
              <TableCell>{row.accepted}</TableCell>
              <TableCell>{row.rejected}</TableCell>
              <TableCell>{row.inserted}</TableCell>
              <TableCell><Badge variant={row.conversionRate > 0 ? 'secondary' : 'outline'}>{row.conversionRate}%</Badge></TableCell>
            </TableRow>
          )) : (
            <TableRow>
              <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                No sales representatives are available in the database yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  )
}

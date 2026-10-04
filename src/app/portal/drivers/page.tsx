import { DriverMobileInvitationDialog } from '@/components/crm/DriverMobileInvitationDialog'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createClient, requireCustomerPortalProfile } from '@/lib/supabase/server'

type InvitationRow = { driver_id: string; status: string; recipient_email: string; expires_at: string; created_at: string }

export default async function PortalDriversPage() {
  const { profile } = await requireCustomerPortalProfile()
  if (!profile?.customer_id) return null
  const db = await createClient()
  const { data: drivers, error } = await db.from('customer_portal_drivers')
    .select('id,first_name,last_name,display_name,email,phone,status,onboarding_status,mobile_account_linked,external_driver_id,provider_status')
    .eq('customer_id', profile.customer_id)
    .order('display_name')
  const driverIds = (drivers ?? []).map((driver) => driver.id)
  const { data: invitationData } = driverIds.length
    ? await db.from('customer_portal_driver_invitations').select('driver_id,status,recipient_email,expires_at,created_at').in('driver_id', driverIds).order('created_at', { ascending: false })
    : { data: [] }
  const latestInvitations = new Map<string, InvitationRow>()
  for (const invitation of (invitationData ?? []) as InvitationRow[]) {
    if (!latestInvitations.has(invitation.driver_id)) latestInvitations.set(invitation.driver_id, invitation)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Drivers</h2>
        <p className="mt-1 text-sm text-muted-foreground">Review drivers synchronized to your company and manage their BESH Mobile access.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Your drivers</CardTitle>
          <CardDescription>{drivers?.length ?? 0} driver records are tied to this company.</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {error ? <p className="p-8 text-center text-destructive">Drivers could not be loaded.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead className="pl-6">Driver</TableHead><TableHead>External ID</TableHead><TableHead>Driver status</TableHead><TableHead>Mobile access</TableHead><TableHead className="pr-6 text-right">Action</TableHead></TableRow></TableHeader>
              <TableBody>
                {(drivers ?? []).map((driver) => {
                  const name = driver.display_name?.trim() || `${driver.first_name} ${driver.last_name}`.trim() || 'Driver'
                  const invitation = latestInvitations.get(driver.id)
                  return <TableRow key={driver.id}>
                    <TableCell className="pl-6"><p className="font-medium">{name}</p><p className="text-xs text-muted-foreground">{driver.email ?? driver.phone ?? 'No contact details'}</p></TableCell>
                    <TableCell className="font-mono text-muted-foreground">{driver.external_driver_id ?? '—'}</TableCell>
                    <TableCell><StatusBadge status={driver.status} /></TableCell>
                    <TableCell><StatusBadge status={driver.onboarding_status} /></TableCell>
                    <TableCell className="pr-6 text-right">
                      <DriverMobileInvitationDialog
                        driverId={driver.id}
                        driverName={name}
                        email={driver.email}
                        authUserLinked={driver.mobile_account_linked}
                        onboardingStatus={driver.onboarding_status}
                        latestInvitation={invitation ? { status: invitation.status, recipientEmail: invitation.recipient_email, expiresAt: invitation.expires_at } : null}
                      />
                    </TableCell>
                  </TableRow>
                })}
                {!drivers?.length && <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">No drivers are tied to your company yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={['active', 'invited'].includes(status.toLowerCase()) ? 'default' : 'secondary'}>{status.replaceAll('_', ' ')}</Badge>
}

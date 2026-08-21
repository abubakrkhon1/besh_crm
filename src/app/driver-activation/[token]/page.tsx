import type { Metadata } from 'next'
import { ShieldCheck } from 'lucide-react'
import { getPublicDriverInvitation } from '@/app/actions/driver-invitations'
import { DriverActivationForm } from '@/components/driver/DriverActivationForm'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LocalDateTime } from '@/components/ui/local-date-time'

export const metadata: Metadata = {
  title: 'Activate BESH Mobile',
  robots: { index: false, follow: false },
}

const messages = {
  invalid: ['Invalid activation link', 'This activation link is not recognized. Ask your fleet administrator for a new invitation.'],
  expired: ['Activation link expired', 'This invitation has expired. Ask your fleet administrator to resend it.'],
  used: ['Account already activated', 'This invitation has already been used. Open BESH Mobile and sign in, or reset your password.'],
  revoked: ['Invitation revoked', 'This invitation is no longer active. Contact your fleet administrator if you still need access.'],
} as const

export default async function DriverActivationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invitation = await getPublicDriverInvitation(token)

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><ShieldCheck className="size-5" /></span>
            <Badge variant="secondary">BESH Mobile</Badge>
          </div>
          <CardTitle>{invitation.status === 'valid' ? `Welcome, ${invitation.driverName}` : messages[invitation.status][0]}</CardTitle>
          <CardDescription>
            {invitation.status === 'valid'
              ? <>Create a password for {invitation.maskedEmail}. This private link expires <LocalDateTime value={invitation.expiresAt} />.</>
              : messages[invitation.status][1]}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invitation.status === 'valid'
            ? <DriverActivationForm token={token} mobileAppUrl={process.env.NEXT_PUBLIC_MOBILE_APP_URL} />
            : <p className="text-sm text-muted-foreground">Contact your fleet administrator to request a new invitation.</p>}
        </CardContent>
      </Card>
    </main>
  )
}

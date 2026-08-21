'use client'

import { FormEvent, useState, useTransition } from 'react'
import { Copy, Mail, ShieldX } from 'lucide-react'
import { toast } from 'sonner'
import { revokeDriverInvitation, sendDriverInvitation, setDriverMobileAccess } from '@/app/actions/driver-invitations'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { LocalDateTime } from '@/components/ui/local-date-time'

type LatestInvitation = {
  status: string
  recipientEmail: string
  expiresAt: string
} | null

export function DriverMobileInvitationDialog({
  driverId,
  driverName,
  email: initialEmail,
  authUserLinked,
  onboardingStatus,
  latestInvitation,
}: {
  driverId: string
  driverName: string
  email: string | null
  authUserLinked: boolean
  onboardingStatus: string
  latestInvitation: LatestInvitation
}) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState(latestInvitation?.recipientEmail ?? initialEmail ?? '')
  const [error, setError] = useState<string>()
  const [activationUrl, setActivationUrl] = useState<string>()
  const [pending, startTransition] = useTransition()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    startTransition(async () => {
      const result = await sendDriverInvitation({ driverId, email })
      if (result.error) {
        setError(result.error)
        return
      }
      setActivationUrl(result.activationUrl)
      toast.success(result.warning ? 'Invitation created; email delivery needs attention.' : 'Driver invitation sent.')
    })
  }

  function revoke() {
    setError(undefined)
    startTransition(async () => {
      const result = await revokeDriverInvitation(driverId)
      if (result.error) {
        setError(result.error)
        return
      }
      setActivationUrl(undefined)
      toast.success('Driver invitation revoked.')
      setOpen(false)
    })
  }

  async function copyLink() {
    if (!activationUrl) return
    await navigator.clipboard.writeText(activationUrl)
    toast.success('Activation link copied.')
  }

  function updateMobileAccess(enabled: boolean) {
    setError(undefined)
    startTransition(async () => {
      const result = await setDriverMobileAccess(driverId, enabled)
      if (result.error) {
        setError(result.error)
        return
      }
      toast.success(enabled ? 'Driver mobile access enabled.' : 'Driver mobile access disabled.')
      if (result.warning) toast.warning(result.warning)
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <Mail data-icon="inline-start" />
        {authUserLinked ? 'Manage access' : onboardingStatus === 'invited' ? 'Manage invite' : 'Invite to mobile'}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{authUserLinked ? `Manage ${driverName}` : `Invite ${driverName}`}</DialogTitle>
          <DialogDescription>{authUserLinked ? 'Enable or immediately disable this driver’s mobile data access.' : 'Send a private account-activation link. Synchronization never creates a password or login automatically.'}</DialogDescription>
        </DialogHeader>
        {authUserLinked ? (
          <div className="flex flex-col gap-4">
            {error && <Alert variant="destructive"><ShieldX /><AlertTitle>Access could not be updated</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
            <Alert>
              <Mail />
              <AlertTitle>Mobile account {onboardingStatus === 'active' ? 'active' : 'disabled'}</AlertTitle>
              <AlertDescription>Disabling access takes effect immediately for driver-scoped database policies and the mobile API.</AlertDescription>
            </Alert>
            <DialogFooter>
              <Button type="button" variant={onboardingStatus === 'active' ? 'destructive' : 'default'} disabled={pending} onClick={() => updateMobileAccess(onboardingStatus !== 'active')}>
                {pending ? 'Updating…' : onboardingStatus === 'active' ? 'Disable mobile access' : 'Enable mobile access'}
              </Button>
            </DialogFooter>
          </div>
        ) : <form onSubmit={submit} className="flex flex-col gap-4">
          {latestInvitation && (
            <Alert>
              <Mail />
              <AlertTitle className="flex items-center gap-2">Latest invitation <Badge variant="secondary">{latestInvitation.status.replaceAll('_', ' ')}</Badge></AlertTitle>
              <AlertDescription>Sent to {latestInvitation.recipientEmail}; expires <LocalDateTime value={latestInvitation.expiresAt} />.</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <ShieldX />
              <AlertTitle>Invitation could not be updated</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {activationUrl && (
            <Alert>
              <Copy />
              <AlertTitle>Activation link created</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-2">
                <span>Keep this link private. It provides access to create the driver account.</span>
                <Button type="button" variant="outline" size="sm" onClick={copyLink}><Copy data-icon="inline-start" />Copy activation link</Button>
              </AlertDescription>
            </Alert>
          )}
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor={`driver-email-${driverId}`}>Verified driver email</FieldLabel>
              <Input id={`driver-email-${driverId}`} value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" maxLength={254} required aria-invalid={Boolean(error)} />
              <FieldDescription>Confirm this address with the driver before sending. It becomes their mobile login.</FieldDescription>
              <FieldError>{error}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            {onboardingStatus === 'invited' && <Button type="button" variant="destructive" disabled={pending} onClick={revoke}>Revoke</Button>}
            <Button type="submit" disabled={pending}>{pending ? 'Sending…' : onboardingStatus === 'invited' ? 'Resend invitation' : 'Send invitation'}</Button>
          </DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { LoaderCircle, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { inviteCustomerPortalAdmin, resendCustomerPortalSetup } from '@/app/actions/customer-portal'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

export function CustomerPortalAccessDialog({
  customerId,
  contactEmail,
  existingAdmin,
}: {
  customerId: string
  contactEmail: string
  existingAdmin: { fullName: string | null; email: string | null; isActive: boolean } | null
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  const canInvite = Boolean(contactEmail.trim())

  function submit() {
    setError(undefined)
    startTransition(async () => {
      const result = await inviteCustomerPortalAdmin({ customerId })
      if (!result.ok) return setError(result.message)
      toast.success(result.message)
      setOpen(false)
    })
  }

  function resendSetup() {
    setError(undefined)
    startTransition(async () => {
      const result = await resendCustomerPortalSetup({ customerId })
      if (!result.ok) return setError(result.message)
      toast.success(result.message)
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <ShieldCheck data-icon="inline-start" />
        {existingAdmin ? 'Portal access' : 'Invite to portal'}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Customer portal access</DialogTitle>
          <DialogDescription>Invite the company using the primary email saved on its customer profile. The account will only see drivers, cards, and activity tied to this customer.</DialogDescription>
        </DialogHeader>
        {existingAdmin ? (
          <div className="flex flex-col gap-5">
            <Alert>
              <ShieldCheck />
              <AlertTitle className="flex items-center gap-2">{existingAdmin.fullName ?? existingAdmin.email ?? 'Customer administrator'} <Badge variant={existingAdmin.isActive ? 'default' : 'secondary'}>{existingAdmin.isActive ? 'Active' : 'Disabled'}</Badge></AlertTitle>
              <AlertDescription>{existingAdmin.email ?? 'No email address'} already has portal access for this company.</AlertDescription>
            </Alert>
            {error && <Alert variant="destructive"><AlertTitle>Setup link could not be sent</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Close</Button><Button type="button" onClick={resendSetup} disabled={pending || !existingAdmin.email}>{pending && <LoaderCircle data-icon="inline-start" className="animate-spin" />}{pending ? 'Sending…' : 'Send new setup link'}</Button></DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <Alert variant={canInvite ? 'default' : 'destructive'}>
              <ShieldCheck />
              <AlertTitle>{canInvite ? 'Invitation recipient' : 'Customer email required'}</AlertTitle>
              <AlertDescription>{canInvite ? contactEmail : 'Add a valid primary email to this customer profile before inviting the company.'}</AlertDescription>
            </Alert>
            {error && <Alert variant="destructive"><AlertTitle>Invitation could not be sent</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button><Button type="button" onClick={submit} disabled={pending || !canInvite}>{pending && <LoaderCircle data-icon="inline-start" className="animate-spin" />}{pending ? 'Sending…' : 'Invite company'}</Button></DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

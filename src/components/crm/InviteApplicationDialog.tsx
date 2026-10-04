'use client'

import { useState, useTransition } from 'react'
import { Check, Copy, MailPlus, Send } from 'lucide-react'
import { toast } from 'sonner'
import { sendApplicationInvitation } from '@/app/actions/application-invitations'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

export function InviteApplicationDialog() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setEmail('')
      setError(null)
      setInvitationUrl(null)
      setEmailSent(false)
    }
  }

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await sendApplicationInvitation(email)
      if (!result.success) {
        setError(result.error ?? 'Unable to send the invitation.')
        return
      }

      setInvitationUrl(result.invitationUrl ?? null)
      setEmailSent(!result.warning)
      if (result.warning) {
        setError(result.warning)
        toast.warning('Invitation link created, but email was not sent.')
      } else {
        toast.success(`Application invitation sent to ${email}.`)
      }
    })
  }

  const copyLink = async () => {
    if (!invitationUrl) return
    await navigator.clipboard.writeText(invitationUrl)
    toast.success('Invitation link copied.')
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button type="button" size="sm" />}>
        <MailPlus data-icon="inline-start" />
        Invite applicant
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite an applicant</DialogTitle>
          <DialogDescription>Send a secure, single-use link to the public application form. The link expires in 7 days.</DialogDescription>
        </DialogHeader>

        {invitationUrl ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="application-invitation-link">Invitation link</FieldLabel>
              <div className="flex gap-2">
                <Input id="application-invitation-link" value={invitationUrl} readOnly />
                <Button type="button" variant="outline" size="icon-lg" onClick={copyLink} aria-label="Copy invitation link">
                  <Copy />
                </Button>
              </div>
              <FieldDescription>{emailSent ? `Email sent to ${email}.` : 'Copy this link and send it manually after email delivery is configured.'}</FieldDescription>
            </Field>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="mx-0 mb-0">
              <Button type="button" onClick={() => handleOpenChange(false)}>
                <Check data-icon="inline-start" />Done
              </Button>
            </DialogFooter>
          </FieldGroup>
        ) : (
          <form onSubmit={submit}>
            <FieldGroup>
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="application-invitation-email">Applicant email</FieldLabel>
                <Input
                  id="application-invitation-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="applicant@company.com"
                  autoComplete="email"
                  required
                  aria-invalid={Boolean(error)}
                />
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              </Field>
              <DialogFooter className="mx-0 mb-0">
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
                <Button type="submit" disabled={isPending || !email.trim()}>
                  <Send data-icon="inline-start" />
                  {isPending ? 'Sending…' : 'Send invitation'}
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

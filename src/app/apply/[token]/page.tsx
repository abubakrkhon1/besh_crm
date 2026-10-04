import { CheckCircle2, FileText } from 'lucide-react'
import { getApplicationInvitation } from '@/app/actions/application-invitations'
import { NewApplicationModal } from '@/components/crm/NewApplicationModal'

export default async function PublicApplicationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const invitation = await getApplicationInvitation(token)

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <header className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <FileText />
          </span>
          <div>
            <p className="font-bold">BESH CRM</p>
            <p className="text-sm text-muted-foreground">Secure fuel card application</p>
          </div>
        </header>

        {invitation.status === 'valid' ? (
          <NewApplicationModal embedded invitationToken={token} initialEmail={invitation.email} />
        ) : invitation.status === 'submitted' ? (
          <div className="flex min-h-[26rem] flex-col items-center justify-center gap-4 rounded-2xl border bg-card p-8 text-center shadow-sm">
            <CheckCircle2 className="size-12 text-status-success-foreground" />
            <div className="flex max-w-md flex-col gap-2">
              <h1 className="text-2xl font-bold">Application submitted successfully!</h1>
              <p className="text-muted-foreground">Thank you. The BESH team has received your application and will contact you after it has been reviewed.</p>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[24rem] flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-8 text-center shadow-sm">
            <h1 className="text-2xl font-bold">
              {invitation.status === 'used' ? 'Application already submitted' : invitation.status === 'expired' ? 'Invitation expired' : 'Invalid invitation'}
            </h1>
            <p className="max-w-md text-muted-foreground">
              {invitation.status === 'used'
                ? 'This one-time application link has already been used.'
                : 'Ask your BESH representative to send you a new application invitation.'}
            </p>
          </div>
        )}
      </div>
    </main>
  )
}

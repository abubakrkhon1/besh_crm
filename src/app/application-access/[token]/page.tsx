import { FileText, LockKeyhole } from 'lucide-react'
import { exchangeApplicationAccessLink, isApplicationAccessLinkValid } from '@/app/actions/application-documents'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export default async function ApplicationAccessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const valid = await isApplicationAccessLinkValid(token)
  const continueAction = exchangeApplicationAccessLink.bind(null, token)

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <header className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><FileText /></span>
          <div><p className="font-bold">BESH CRM</p><p className="text-sm text-muted-foreground">Secure application portal</p></div>
        </header>
        <Card>
          <CardHeader>
            <span className="mb-2 flex size-10 items-center justify-center rounded-full bg-muted"><LockKeyhole className="size-5" /></span>
            <CardTitle>{valid ? 'Open secure document portal' : 'Secure link unavailable'}</CardTitle>
            <CardDescription>{valid ? 'Continue to view and upload the documents requested for your application.' : 'This link is invalid, expired, already used, or revoked. Ask your BESH representative for a new link.'}</CardDescription>
          </CardHeader>
          {valid && (
            <>
              <CardContent><p className="text-sm text-muted-foreground">For your protection, this link can be used once. Continuing creates a private 24-hour session on this device.</p></CardContent>
              <CardFooter className="justify-end">
                <form action={continueAction}><Button type="submit">Continue securely</Button></form>
              </CardFooter>
            </>
          )}
        </Card>
      </div>
    </main>
  )
}


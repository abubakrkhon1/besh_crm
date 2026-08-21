import { FileText } from 'lucide-react'
import { getApplicationPortalData } from '@/app/actions/application-documents'
import { ApplicationDocumentPortal } from '@/components/crm/ApplicationDocumentPortal'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function ApplicationPortalPage() {
  const portal = await getApplicationPortalData()
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><FileText /></span>
          <div><p className="font-bold">BESH CRM</p><p className="text-sm text-muted-foreground">Secure application portal</p></div>
        </header>
        {portal ? (
          <ApplicationDocumentPortal companyName={portal.application.company_legal_name} status={portal.application.status} requests={portal.requests} documents={portal.documents} sessionExpiresAt={portal.sessionExpiresAt} />
        ) : (
          <Card><CardHeader><CardTitle>Secure link unavailable</CardTitle><CardDescription>Your session is missing or expired. Ask your BESH representative to send a new document request link.</CardDescription></CardHeader></Card>
        )}
      </div>
    </main>
  )
}


'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, CheckCircle2, FileText, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { completeApplicationDocumentUpload, createApplicationDocumentUpload } from '@/app/actions/application-documents'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

type PortalRequest = { id: string; label: string; instructions: string | null; due_at: string | null; status: string; is_required: boolean }
type PortalDocument = { id: string; request_id: string; original_filename: string; size_bytes: number; review_status: string; rejection_reason: string | null; created_at: string }

export function ApplicationDocumentPortal({ companyName, status, requests, documents, sessionExpiresAt }: {
  companyName: string
  status: string
  requests: PortalRequest[]
  documents: PortalDocument[]
  sessionExpiresAt: string
}) {
  const router = useRouter()
  const [files, setFiles] = useState<Record<string, File | undefined>>({})
  const [activeRequest, setActiveRequest] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const upload = (request: PortalRequest) => {
    const file = files[request.id]
    if (!file) return
    startTransition(async () => {
      setActiveRequest(request.id)
      try {
        const prepared = await createApplicationDocumentUpload({ requestId: request.id, originalFilename: file.name, mimeType: file.type, sizeBytes: file.size })
        if (!prepared.success || !prepared.path || !prepared.token || !prepared.intentId) throw new Error(prepared.error ?? 'Unable to prepare upload.')

        const supabase = createClient()
        const { error: uploadError } = await supabase.storage.from('application-documents').uploadToSignedUrl(prepared.path, prepared.token, file, { contentType: file.type, upsert: false })
        if (uploadError) throw new Error(uploadError.message)

        const completed = await completeApplicationDocumentUpload({ intentId: prepared.intentId })
        if (!completed.success) throw new Error(completed.error ?? 'Unable to verify upload.')
        setFiles((current) => ({ ...current, [request.id]: undefined }))
        toast.success(`${request.label} uploaded securely.`)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Unable to upload the document.')
      } finally {
        setActiveRequest(null)
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1"><CardTitle>Requested documents</CardTitle><CardDescription>{companyName}</CardDescription></div>
          <Badge variant="secondary">{formatStatus(status)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">Upload PDF, JPEG, or PNG files up to 10 MB. Files are stored privately and verified before submission.</p>
        {requests.map((request) => {
          const document = documents.find((item) => item.request_id === request.id)
          const canUpload = request.status === 'requested' || request.status === 'rejected'
          return (
            <Card key={request.id} className="py-0 shadow-none">
              <CardHeader className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <CardTitle className="text-base">{request.label}{request.is_required ? ' *' : ''}</CardTitle>
                    {request.instructions && <CardDescription>{request.instructions}</CardDescription>}
                    {request.due_at && <p className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3" />Due {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(request.due_at))}</p>}
                  </div>
                  <Badge variant={request.status === 'accepted' ? 'default' : 'outline'}>{formatStatus(request.status)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 px-4 pb-4">
                {document && (
                  <div className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm">
                    {document.review_status === 'accepted' ? <CheckCircle2 className="size-4" /> : <FileText className="size-4" />}
                    <span className="min-w-0 flex-1 truncate">{document.original_filename}</span>
                    <span className="text-xs text-muted-foreground">{formatBytes(document.size_bytes)}</span>
                  </div>
                )}
                {request.status === 'rejected' && document?.rejection_reason && <p role="alert" className="text-sm text-destructive">Replacement requested: {document.rejection_reason}</p>}
                {canUpload && (
                  <Field>
                    <FieldLabel htmlFor={`upload-${request.id}`}>Choose file</FieldLabel>
                    <Input id={`upload-${request.id}`} type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event) => setFiles((current) => ({ ...current, [request.id]: event.target.files?.[0] }))} disabled={isPending && activeRequest === request.id} />
                    <FieldDescription>PDF, JPG, or PNG · maximum 10 MB</FieldDescription>
                  </Field>
                )}
              </CardContent>
              {canUpload && (
                <CardFooter className="justify-end p-4 pt-0">
                  <Button type="button" onClick={() => upload(request)} disabled={!files[request.id] || isPending}>
                    <Upload data-icon="inline-start" />{activeRequest === request.id ? 'Uploading…' : 'Upload document'}
                  </Button>
                </CardFooter>
              )}
            </Card>
          )
        })}
      </CardContent>
      <CardFooter><p className="text-xs text-muted-foreground">Secure session expires {new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(sessionExpiresAt))}.</p></CardFooter>
    </Card>
  )
}

function formatStatus(value: string) { return value.split('_').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ') }
function formatBytes(value: number) { return value < 1_048_576 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1_048_576).toFixed(1)} MB` }


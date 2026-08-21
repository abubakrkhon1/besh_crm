'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Download, FileText, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { acceptApplicationDocument, createApplicationDocumentDownloadUrl, rejectApplicationDocument } from '@/app/actions/application-documents'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'

type ReviewDocument = {
  id: string; original_filename: string; mime_type: string; size_bytes: number; review_status: string;
  rejection_reason: string | null; reviewed_at: string | null; created_at: string;
}
type ReviewRequest = {
  id: string; label: string; instructions: string | null; due_at: string | null; status: string; is_required: boolean;
  created_at: string; documents: ReviewDocument[];
}

export function ApplicationDocumentsReview({ requests }: { requests: ReviewRequest[] }) {
  const router = useRouter()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const download = (document: ReviewDocument) => {
    startTransition(async () => {
      setActiveId(document.id)
      const result = await createApplicationDocumentDownloadUrl(document.id)
      setActiveId(null)
      if (!result.success || !result.url) {
        toast.error(result.error ?? 'Unable to download document.')
        return
      }
      window.location.assign(result.url)
    })
  }

  const accept = (document: ReviewDocument) => {
    startTransition(async () => {
      setActiveId(document.id)
      const result = await acceptApplicationDocument({ documentId: document.id })
      setActiveId(null)
      if (!result.success) {
        toast.error(result.error ?? 'Unable to accept document.')
        return
      }
      toast.success(`${document.original_filename} accepted.`)
      router.refresh()
    })
  }

  if (!requests.length) {
    return <Card><CardHeader><CardTitle>No documents requested</CardTitle><CardDescription>Use “Request Documents” to ask the applicant for supporting files.</CardDescription></CardHeader></Card>
  }

  return (
    <div className="flex flex-col gap-4">
      {requests.map((request) => (
        <Card key={request.id}>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle className="text-base">{request.label}{request.is_required ? ' *' : ''}</CardTitle>
                {request.instructions && <CardDescription>{request.instructions}</CardDescription>}
              </div>
              <Badge variant={request.status === 'accepted' ? 'default' : 'outline'}>{formatStatus(request.status)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {!request.documents.length && <p className="text-sm text-muted-foreground">Waiting for applicant upload.</p>}
            {request.documents.map((document, index) => {
              const current = index === 0
              return (
                <div key={document.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
                  <FileText className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{document.original_filename}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(document.size_bytes)} · Uploaded {formatDate(document.created_at)}{!current ? ' · Previous attempt' : ''}</p>
                    {document.rejection_reason && <p className="mt-1 text-sm text-destructive">Rejected: {document.rejection_reason}</p>}
                  </div>
                  <Badge variant={document.review_status === 'accepted' ? 'default' : document.review_status === 'rejected' ? 'destructive' : 'secondary'}>{formatStatus(document.review_status)}</Badge>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => download(document)} disabled={isPending && activeId === document.id}>
                      <Download data-icon="inline-start" />Download
                    </Button>
                    {current && document.review_status === 'uploaded' && (
                      <>
                        <ReplacementDialog document={document} onComplete={() => router.refresh()} />
                        <Button type="button" size="sm" onClick={() => accept(document)} disabled={isPending}>
                          <CheckCircle2 data-icon="inline-start" />Accept
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function ReplacementDialog({ document, onComplete }: { document: ReviewDocument; onComplete: () => void }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await rejectApplicationDocument({ documentId: document.id, reason })
      if (!result.success) return setError(result.error ?? 'Unable to request replacement.')
      if (result.warning) toast.warning(result.warning)
      else toast.success('Replacement requested and applicant notified.')
      setOpen(false); setReason(''); onComplete()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}><RotateCcw data-icon="inline-start" />Replace</DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Request replacement</DialogTitle><DialogDescription>Explain what is wrong with {document.original_filename}. The applicant will receive a new secure upload link.</DialogDescription></DialogHeader>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor={`replacement-reason-${document.id}`}>Replacement reason</FieldLabel>
              <Textarea id={`replacement-reason-${document.id}`} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required aria-invalid={Boolean(error)} />
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            </Field>
            <DialogFooter className="mx-0 mb-0">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending || reason.trim().length < 3}>{isPending ? 'Sending…' : 'Request replacement'}</Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function formatStatus(value: string) { return value.split('_').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' ') }
function formatBytes(value: number) { return value < 1_048_576 ? `${Math.ceil(value / 1024)} KB` : `${(value / 1_048_576).toFixed(1)} MB` }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }

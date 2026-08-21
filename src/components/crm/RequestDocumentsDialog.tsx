'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, FileInput, Send } from 'lucide-react'
import { toast } from 'sonner'
import { requestApplicationDocuments } from '@/app/actions/application-documents'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

const DOCUMENT_OPTIONS = [
  ['drivers_license', "Driver's license"],
  ['voided_check', 'Voided check'],
  ['articles_of_incorporation', 'Articles of incorporation'],
  ['ein_confirmation', 'EIN confirmation'],
  ['bank_statement', 'Bank statement'],
  ['other', 'Custom document'],
] as const

type DocumentType = (typeof DOCUMENT_OPTIONS)[number][0]

export function RequestDocumentsDialog({ applicationId, disabled = false }: { applicationId: string; disabled?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<DocumentType[]>([])
  const [customLabel, setCustomLabel] = useState('')
  const [instructions, setInstructions] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [accessUrl, setAccessUrl] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const submittingRef = useRef(false)

  const reset = () => {
    setSelected([]); setCustomLabel(''); setInstructions(''); setDueDate(''); setError(null); setAccessUrl(null); setWarning(null)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) reset()
  }

  const toggle = (documentType: DocumentType) => {
    setSelected((current) => current.includes(documentType) ? current.filter((item) => item !== documentType) : [...current, documentType])
  }

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submittingRef.current) return
    submittingRef.current = true
    setError(null)
    startTransition(async () => {
      try {
        const result = await requestApplicationDocuments({ applicationId, documentTypes: selected, customLabel, instructions, dueDate })
        if (!result.success) return setError(result.error ?? 'Unable to request documents.')
        setAccessUrl(result.accessUrl ?? null)
        setWarning(result.warning ?? null)
        if (result.warning) toast.warning('Request saved, but the email was not delivered.')
        else toast.success('Document request sent to the applicant.')
        router.refresh()
      } finally {
        submittingRef.current = false
      }
    })
  }

  const copyLink = async () => {
    if (!accessUrl) return
    await navigator.clipboard.writeText(accessUrl)
    toast.success('Secure link copied.')
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button type="button" variant="outline" className="h-11 px-5 text-sm" disabled={disabled} />}>
        <FileInput data-icon="inline-start" />Request Documents
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request documents</DialogTitle>
          <DialogDescription>Select what the applicant must provide. They will receive a secure link that expires in 7 days.</DialogDescription>
        </DialogHeader>

        {accessUrl ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="document-access-link">Applicant access link</FieldLabel>
              <div className="flex gap-2">
                <Input id="document-access-link" value={accessUrl} readOnly />
                <Button type="button" variant="outline" size="icon-lg" onClick={copyLink} aria-label="Copy applicant access link"><Copy /></Button>
              </div>
              <FieldDescription>{warning ?? 'The document request email was sent successfully.'}</FieldDescription>
            </Field>
            <DialogFooter className="mx-0 mb-0">
              <Button type="button" onClick={() => handleOpenChange(false)}><Check data-icon="inline-start" />Done</Button>
            </DialogFooter>
          </FieldGroup>
        ) : (
          <form onSubmit={submit}>
            <FieldGroup>
              <FieldSet>
                <FieldLegend>Required documents</FieldLegend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {DOCUMENT_OPTIONS.map(([value, label]) => (
                    <Field key={value} orientation="horizontal">
                      <input id={`document-${value}`} type="checkbox" checked={selected.includes(value)} onChange={() => toggle(value)} className="size-4 accent-primary" />
                      <FieldLabel htmlFor={`document-${value}`}>{label}</FieldLabel>
                    </Field>
                  ))}
                </div>
              </FieldSet>

              {selected.includes('other') && (
                <Field>
                  <FieldLabel htmlFor="custom-document-label">Custom document name</FieldLabel>
                  <Input id="custom-document-label" value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} maxLength={120} required />
                </Field>
              )}

              <Field>
                <FieldLabel htmlFor="document-due-date">Due date</FieldLabel>
                <Input id="document-due-date" type="date" value={dueDate} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setDueDate(event.target.value)} />
                <FieldDescription>Optional. The secure access link always expires after 7 days.</FieldDescription>
              </Field>

              <Field>
                <FieldLabel htmlFor="document-instructions">Instructions</FieldLabel>
                <Textarea id="document-instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} maxLength={1000} placeholder="Add context that applies to this request…" />
              </Field>

              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <DialogFooter className="mx-0 mb-0">
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
                <Button type="submit" disabled={isPending || selected.length === 0}>
                  <Send data-icon="inline-start" />{isPending ? 'Sending…' : 'Send request'}
                </Button>
              </DialogFooter>
            </FieldGroup>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

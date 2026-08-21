'use server'

import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRoles } from '@/lib/supabase/server'
import { escapeEmailHtml, sendApplicationEmail } from '@/lib/email/resend'
import { APPLICATION_PORTAL_COOKIE, getApplicationPortalSession, hashPortalToken } from '@/lib/application-portal'
import { hasAllowedApplicationDocumentSignature, MAX_APPLICATION_DOCUMENT_BYTES } from '@/lib/validation/application-documents'

const APPLICATION_ROLES = ['owner', 'admin', 'general_manager', 'sales_manager'] as const

const documentRequestSchema = z.object({
  applicationId: z.string().uuid(),
  documentTypes: z.array(z.enum(['drivers_license', 'voided_check', 'articles_of_incorporation', 'ein_confirmation', 'bank_statement', 'other'])).min(1)
    .refine((values) => new Set(values).size === values.length, 'Each document can only be requested once.'),
  customLabel: z.string().trim().max(120).optional(),
  instructions: z.string().trim().max(1000).optional(),
  dueDate: z.string().trim().optional(),
}).superRefine((value, context) => {
  if (value.documentTypes.includes('other') && !value.customLabel) {
    context.addIssue({ code: 'custom', path: ['customLabel'], message: 'Enter a name for the custom document.' })
  }
})

const DOCUMENT_LABELS: Record<string, string> = {
  drivers_license: "Driver's license",
  voided_check: 'Voided check',
  articles_of_incorporation: 'Articles of incorporation',
  ein_confirmation: 'EIN confirmation',
  bank_statement: 'Bank statement',
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

async function publicBaseUrl() {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  const requestHeaders = await headers()
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host')
  const protocol = requestHeaders.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')
  if (!host) throw new Error('Unable to determine public application URL.')
  return `${protocol}://${host}`
}

export type RequestDocumentsResult = {
  success?: boolean
  error?: string
  warning?: string
  accessUrl?: string
}

export async function requestApplicationDocuments(input: unknown): Promise<RequestDocumentsResult> {
  const parsed = documentRequestSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the document request.' }

  const { error: accessError, profile } = await requireRoles(APPLICATION_ROLES)
  if (accessError || !profile) return { error: accessError ?? 'Unauthorized' }

  const admin = createAdminClient()
  const { data: application, error: applicationError } = await admin
    .from('applications')
    .select('id, company_legal_name, first_name, email, status')
    .eq('id', parsed.data.applicationId)
    .single()

  if (applicationError || !application) return { error: 'Application not found.' }
  if (application.status === 'approved' || application.status === 'denied') return { error: 'A completed application cannot request documents.' }

  const candidateRequests = parsed.data.documentTypes.map((documentType) => ({
    application_id: application.id,
    document_type: documentType,
    label: documentType === 'other' ? parsed.data.customLabel! : DOCUMENT_LABELS[documentType],
    instructions: parsed.data.instructions || null,
    due_at: parsed.data.dueDate ? new Date(`${parsed.data.dueDate}T23:59:59`).toISOString() : null,
    requested_by_profile_id: profile.id,
  }))
  const { data: existingRequests } = await admin.from('application_document_requests')
    .select('document_type, label').eq('application_id', application.id)
  const existingKeys = new Set((existingRequests ?? []).map((request) => `${request.document_type}|${request.label.trim().toLowerCase()}`))
  const requests = candidateRequests.filter((request) => !existingKeys.has(`${request.document_type}|${request.label.trim().toLowerCase()}`))
  if (!requests.length) return { error: 'Those documents have already been requested for this application.' }

  const token = randomBytes(32).toString('base64url')
  const accessUrl = `${await publicBaseUrl()}/application-access/${token}`
  const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString()

  const { data: createdRequests, error: requestsError } = await admin.from('application_document_requests').insert(requests).select('id')
  if (requestsError || !createdRequests?.length) {
    console.error('Unable to create document requests:', requestsError)
    return { error: requestsError?.code === '23505' ? 'One or more of those documents have already been requested.' : 'Unable to save the requested documents.' }
  }

  const { data: link, error: linkError } = await admin.from('application_access_links').insert({
    application_id: application.id,
    token_hash: hashToken(token),
    created_by_profile_id: profile.id,
    expires_at: expiresAt,
  }).select('id').single()

  if (linkError || !link) {
    await admin.from('application_document_requests').delete().in('id', createdRequests.map((request) => request.id))
    console.error('Unable to create application access link:', linkError)
    return { error: 'Unable to create the secure applicant link.' }
  }

  const { error: statusError } = await admin.from('applications').update({ status: 'needs_documents' }).eq('id', application.id)
  if (statusError) {
    await admin.from('application_access_links').delete().eq('id', link.id)
    await admin.from('application_document_requests').delete().in('id', createdRequests.map((request) => request.id))
    console.error('Unable to update application workflow status:', statusError)
    return { error: 'Unable to update the application status.' }
  }

  const labels = requests.map((request) => request.label)
  const safeName = escapeEmailHtml(application.first_name)
  const safeCompany = escapeEmailHtml(application.company_legal_name)
  const safeUrl = escapeEmailHtml(accessUrl)
  const list = labels.map((label) => `<li>${escapeEmailHtml(label)}</li>`).join('')
  const delivery = await sendApplicationEmail({
    to: application.email,
    subject: 'Documents requested for your BESH application',
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#171717;max-width:600px;margin:auto"><h1 style="font-size:22px">Documents requested</h1><p>Hi ${safeName},</p><p>We need additional documents to continue reviewing the fuel card application for ${safeCompany}.</p><ul>${list}</ul><p><a href="${safeUrl}" style="display:inline-block;background:#171717;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">View document request</a></p><p style="color:#666;font-size:13px">This secure link expires in 7 days. Do not forward it.</p></div>`,
  })

  await admin.from('activity_logs').insert({
    entity_type: 'application', entity_id: application.id, action: 'documents_requested',
    description: `${labels.length} document${labels.length === 1 ? '' : 's'} requested`,
    metadata: { labels, access_link_id: link.id, email_sent: delivery.sent }, created_by: profile.auth_user_id,
  })

  revalidatePath('/crm/applications')
  revalidatePath(`/crm/applications/${application.id}`)
  if (!delivery.sent) return { success: true, warning: `${delivery.error} Copy the secure link and send it manually.`, accessUrl }
  return { success: true, accessUrl }
}

const uploadRequestSchema = z.object({
  requestId: z.string().uuid(),
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png']),
  sizeBytes: z.number().int().positive().max(MAX_APPLICATION_DOCUMENT_BYTES),
})

const completeUploadSchema = z.object({ intentId: z.string().uuid() })
const DOCUMENT_BUCKET = 'application-documents'

export async function isApplicationAccessLinkValid(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return false
  const admin = createAdminClient()
  const { data } = await admin.from('application_access_links').select('id')
    .eq('token_hash', hashPortalToken(token)).gt('expires_at', new Date().toISOString())
    .is('consumed_at', null).is('revoked_at', null).maybeSingle()
  return Boolean(data)
}

export async function exchangeApplicationAccessLink(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) redirect('/application-portal')
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data: link } = await admin.from('application_access_links').update({ consumed_at: now })
    .eq('token_hash', hashPortalToken(token)).gt('expires_at', now)
    .is('consumed_at', null).is('revoked_at', null)
    .select('id, application_id').maybeSingle()
  if (!link) redirect('/application-portal')

  const sessionToken = randomBytes(32).toString('base64url')
  const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const { error: sessionError } = await admin.from('application_portal_sessions').insert({
    application_id: link.application_id,
    session_token_hash: hashPortalToken(sessionToken),
    expires_at: sessionExpiresAt.toISOString(),
  })
  if (sessionError) {
    console.error('Unable to create application portal session:', sessionError)
    await admin.from('application_access_links').update({ consumed_at: null }).eq('id', link.id)
    redirect('/application-portal')
  }

  const cookieStore = await cookies()
  cookieStore.set(APPLICATION_PORTAL_COOKIE, sessionToken, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires: sessionExpiresAt,
  })
  redirect('/application-portal')
}

export async function getApplicationPortalData() {
  const session = await getApplicationPortalSession()
  if (!session) return null
  const admin = createAdminClient()
  const [{ data: application }, { data: requests }, { data: documents }] = await Promise.all([
    admin.from('applications').select('id, company_legal_name, status').eq('id', session.application_id).single(),
    admin.from('application_document_requests').select('id, label, instructions, due_at, status, is_required').eq('application_id', session.application_id).order('created_at'),
    admin.from('application_documents').select('id, request_id, original_filename, size_bytes, review_status, rejection_reason, created_at').eq('application_id', session.application_id).order('created_at', { ascending: false }),
  ])
  if (!application) return null
  return { application, requests: requests ?? [], documents: documents ?? [], sessionExpiresAt: session.expires_at }
}

export async function createApplicationDocumentUpload(input: unknown) {
  const parsed = uploadRequestSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Invalid file.' }
  const session = await getApplicationPortalSession()
  if (!session) return { error: 'Your secure session has expired. Request a new link.' }

  const admin = createAdminClient()
  const { data: request } = await admin.from('application_document_requests')
    .select('id, status').eq('id', parsed.data.requestId).eq('application_id', session.application_id).maybeSingle()
  if (!request) return { error: 'Document request not found.' }
  if (request.status === 'accepted') return { error: 'This document has already been accepted.' }

  const extension = parsed.data.mimeType === 'application/pdf' ? 'pdf' : parsed.data.mimeType === 'image/png' ? 'png' : 'jpg'
  const storagePath = `${session.application_id}/${request.id}/${randomUUID()}.${extension}`
  const { data: intent, error: intentError } = await admin.from('application_document_upload_intents').insert({
    portal_session_id: session.id,
    application_id: session.application_id,
    request_id: request.id,
    storage_path: storagePath,
    original_filename: parsed.data.originalFilename,
    mime_type: parsed.data.mimeType,
    size_bytes: parsed.data.sizeBytes,
  }).select('id').single()
  if (intentError || !intent) return { error: 'Unable to prepare the secure upload.' }

  const { data: signedUpload, error: signedUploadError } = await admin.storage.from(DOCUMENT_BUCKET).createSignedUploadUrl(storagePath)
  if (signedUploadError || !signedUpload) {
    await admin.from('application_document_upload_intents').delete().eq('id', intent.id)
    console.error('Unable to create signed document upload:', signedUploadError)
    return { error: 'Unable to prepare the private storage location.' }
  }

  return { success: true, intentId: intent.id, path: signedUpload.path, token: signedUpload.token }
}

export async function completeApplicationDocumentUpload(input: unknown) {
  const parsed = completeUploadSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid upload confirmation.' }
  const session = await getApplicationPortalSession()
  if (!session) return { error: 'Your secure session has expired. Request a new link.' }

  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data: intent } = await admin.from('application_document_upload_intents').select('*')
    .eq('id', parsed.data.intentId).eq('portal_session_id', session.id).eq('application_id', session.application_id)
    .gt('expires_at', now).is('completed_at', null).maybeSingle()
  if (!intent) return { error: 'This upload has expired. Choose the file again.' }

  const { data: file, error: downloadError } = await admin.storage.from(DOCUMENT_BUCKET).download(intent.storage_path)
  if (downloadError || !file) return { error: 'The uploaded file could not be verified.' }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const valid = bytes.length === Number(intent.size_bytes) && bytes.length <= MAX_APPLICATION_DOCUMENT_BYTES && hasAllowedApplicationDocumentSignature(bytes, intent.mime_type)
  if (!valid) {
    await admin.storage.from(DOCUMENT_BUCKET).remove([intent.storage_path])
    await admin.from('application_document_upload_intents').delete().eq('id', intent.id)
    return { error: 'The file content does not match an allowed PDF, JPEG, or PNG file.' }
  }

  const { error: documentError } = await admin.from('application_documents').insert({
    application_id: session.application_id,
    request_id: intent.request_id,
    storage_path: intent.storage_path,
    original_filename: intent.original_filename,
    mime_type: intent.mime_type,
    size_bytes: intent.size_bytes,
    submitted_by: 'applicant',
  })
  if (documentError) {
    console.error('Unable to record uploaded application document:', documentError)
    return { error: 'The file uploaded, but could not be attached to the application.' }
  }

  await Promise.all([
    admin.from('application_document_upload_intents').update({ completed_at: now }).eq('id', intent.id),
    admin.from('application_document_requests').update({ status: 'uploaded', completed_at: now }).eq('id', intent.request_id),
    admin.from('activity_logs').insert({ entity_type: 'application', entity_id: session.application_id, action: 'document_uploaded', description: intent.original_filename, metadata: { request_id: intent.request_id } }),
  ])

  const { data: requiredRequests } = await admin.from('application_document_requests').select('status').eq('application_id', session.application_id).eq('is_required', true)
  const allRequiredUploaded = Boolean(requiredRequests?.length) && requiredRequests!.every((request) => request.status === 'uploaded' || request.status === 'accepted')
  if (allRequiredUploaded) await admin.from('applications').update({ status: 'under_review' }).eq('id', session.application_id)

  revalidatePath('/application-portal')
  revalidatePath('/crm/applications')
  revalidatePath(`/crm/applications/${session.application_id}`)
  return { success: true }
}

const reviewDocumentSchema = z.object({ documentId: z.string().uuid() })
const rejectDocumentSchema = reviewDocumentSchema.extend({ reason: z.string().trim().min(3, 'Explain what must be replaced.').max(500) })

export async function getStaffApplicationDocuments(applicationId: string) {
  if (!z.string().uuid().safeParse(applicationId).success) return []
  const { error: accessError } = await requireRoles(APPLICATION_ROLES)
  if (accessError) return []
  const admin = createAdminClient()
  const [{ data: requests }, { data: documents }] = await Promise.all([
    admin.from('application_document_requests').select('id, label, instructions, due_at, status, is_required, created_at').eq('application_id', applicationId).order('created_at'),
    admin.from('application_documents').select('id, request_id, original_filename, mime_type, size_bytes, review_status, rejection_reason, reviewed_at, created_at').eq('application_id', applicationId).order('created_at', { ascending: false }),
  ])
  return (requests ?? []).map((request) => ({ ...request, documents: (documents ?? []).filter((document) => document.request_id === request.id) }))
}

export async function createApplicationDocumentDownloadUrl(documentId: string) {
  const parsed = reviewDocumentSchema.safeParse({ documentId })
  if (!parsed.success) return { error: 'Invalid document.' }
  const { error: accessError } = await requireRoles(APPLICATION_ROLES)
  if (accessError) return { error: accessError }
  const admin = createAdminClient()
  const { data: document } = await admin.from('application_documents').select('storage_path, original_filename').eq('id', documentId).maybeSingle()
  if (!document) return { error: 'Document not found.' }
  const { data, error } = await admin.storage.from(DOCUMENT_BUCKET).createSignedUrl(document.storage_path, 60, { download: document.original_filename })
  if (error || !data) return { error: 'Unable to create the private download link.' }
  return { success: true, url: data.signedUrl }
}

export async function acceptApplicationDocument(input: unknown) {
  const parsed = reviewDocumentSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid document.' }
  const { error: accessError, profile } = await requireRoles(APPLICATION_ROLES)
  if (accessError || !profile) return { error: accessError ?? 'Unauthorized' }
  const admin = createAdminClient()
  const { data: document } = await admin.from('application_documents')
    .select('id, application_id, request_id, original_filename, review_status').eq('id', parsed.data.documentId).maybeSingle()
  if (!document) return { error: 'Document not found.' }
  const { data: latestDocument } = await admin.from('application_documents').select('id').eq('request_id', document.request_id).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (document.review_status !== 'uploaded' || latestDocument?.id !== document.id) return { error: 'Only the current uploaded document can be accepted.' }
  const now = new Date().toISOString()
  const { error } = await admin.from('application_documents').update({
    review_status: 'accepted', rejection_reason: null, reviewed_by_profile_id: profile.id, reviewed_at: now,
  }).eq('id', document.id)
  if (error) return { error: 'Unable to accept the document.' }
  await admin.from('application_document_requests').update({ status: 'accepted', completed_at: now }).eq('id', document.request_id)
  await admin.from('activity_logs').insert({
    entity_type: 'application', entity_id: document.application_id, action: 'document_accepted',
    description: document.original_filename, metadata: { document_id: document.id, request_id: document.request_id }, created_by: profile.auth_user_id,
  })

  const { data: required } = await admin.from('application_document_requests').select('status').eq('application_id', document.application_id).eq('is_required', true)
  const allAccepted = Boolean(required?.length) && required!.every((request) => request.status === 'accepted')
  if (allAccepted) {
    const { data: application } = await admin.from('applications').select('first_name, email, company_legal_name').eq('id', document.application_id).single()
    if (application) {
      await sendApplicationEmail({
        to: application.email,
        subject: 'Your BESH application documents were accepted',
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#171717;max-width:600px;margin:auto"><h1 style="font-size:22px">Documents accepted</h1><p>Hi ${escapeEmailHtml(application.first_name)},</p><p>We received and accepted the requested documents for ${escapeEmailHtml(application.company_legal_name)}. Your application remains under review, and we will contact you when a decision is available.</p></div>`,
      })
    }
  }
  revalidatePath(`/crm/applications/${document.application_id}`)
  revalidatePath('/crm/applications')
  return { success: true }
}

export async function rejectApplicationDocument(input: unknown) {
  const parsed = rejectDocumentSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the replacement reason.' }
  const { error: accessError, profile } = await requireRoles(APPLICATION_ROLES)
  if (accessError || !profile) return { error: accessError ?? 'Unauthorized' }
  const admin = createAdminClient()
  const { data: document } = await admin.from('application_documents')
    .select('id, application_id, request_id, original_filename, review_status').eq('id', parsed.data.documentId).maybeSingle()
  if (!document) return { error: 'Document not found.' }
  const { data: latestDocument } = await admin.from('application_documents').select('id').eq('request_id', document.request_id).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (document.review_status !== 'uploaded' || latestDocument?.id !== document.id) return { error: 'Only the current uploaded document can be replaced.' }
  const [{ data: request }, { data: application }] = await Promise.all([
    admin.from('application_document_requests').select('label').eq('id', document.request_id).single(),
    admin.from('applications').select('first_name, email, company_legal_name').eq('id', document.application_id).single(),
  ])
  if (!request || !application) return { error: 'Application document details are unavailable.' }

  const now = new Date().toISOString()
  await Promise.all([
    admin.from('application_documents').update({ review_status: 'rejected', rejection_reason: parsed.data.reason, reviewed_by_profile_id: profile.id, reviewed_at: now }).eq('id', document.id),
    admin.from('application_document_requests').update({ status: 'rejected', completed_at: null }).eq('id', document.request_id),
    admin.from('applications').update({ status: 'needs_documents' }).eq('id', document.application_id),
  ])

  const token = randomBytes(32).toString('base64url')
  const accessUrl = `${await publicBaseUrl()}/application-access/${token}`
  await admin.from('application_access_links').update({ revoked_at: now }).eq('application_id', document.application_id).is('consumed_at', null).is('revoked_at', null)
  const { data: link, error: linkError } = await admin.from('application_access_links').insert({
    application_id: document.application_id, token_hash: hashToken(token), created_by_profile_id: profile.id,
  }).select('id').single()
  if (linkError || !link) return { error: 'Replacement saved, but a new secure link could not be created.' }

  const delivery = await sendApplicationEmail({
    to: application.email,
    subject: `Replacement needed: ${request.label}`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#171717;max-width:600px;margin:auto"><h1 style="font-size:22px">Replacement document needed</h1><p>Hi ${escapeEmailHtml(application.first_name)},</p><p>We need a replacement for <strong>${escapeEmailHtml(request.label)}</strong> on the application for ${escapeEmailHtml(application.company_legal_name)}.</p><p><strong>Reason:</strong> ${escapeEmailHtml(parsed.data.reason)}</p><p><a href="${escapeEmailHtml(accessUrl)}" style="display:inline-block;background:#171717;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Upload replacement</a></p><p style="color:#666;font-size:13px">This secure link expires in 7 days and can be used once.</p></div>`,
  })
  await admin.from('activity_logs').insert({
    entity_type: 'application', entity_id: document.application_id, action: 'document_rejected',
    description: `${request.label}: ${parsed.data.reason}`, metadata: { document_id: document.id, request_id: document.request_id, access_link_id: link.id, email_sent: delivery.sent }, created_by: profile.auth_user_id,
  })
  revalidatePath(`/crm/applications/${document.application_id}`)
  revalidatePath('/crm/applications')
  return delivery.sent ? { success: true } : { success: true, warning: `${delivery.error} Send this link manually: ${accessUrl}`, accessUrl }
}

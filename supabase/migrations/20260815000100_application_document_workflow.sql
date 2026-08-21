-- Foundation for the post-submission application workflow. All applicant
-- access remains server-mediated; no public table or bucket policies are added.

alter table public.applications
  drop constraint if exists applications_status_check;

alter table public.applications
  add constraint applications_status_check
  check (status in ('pending', 'under_review', 'needs_documents', 'approved', 'denied'));

alter table public.application_invitations
  add column delivery_status text not null default 'pending',
  add column provider_message_id text,
  add column sent_at timestamptz,
  add column last_delivery_error text,
  add column revoked_at timestamptz,
  add constraint application_invitations_delivery_status_check
    check (delivery_status in ('pending', 'sent', 'failed'));

create index application_invitations_application_id_idx
  on public.application_invitations (application_id, created_at desc);

create table public.application_document_requests (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  document_type text not null,
  label text not null,
  instructions text,
  is_required boolean not null default true,
  due_at timestamptz,
  status text not null default 'requested',
  requested_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint application_document_requests_type_not_blank check (btrim(document_type) <> ''),
  constraint application_document_requests_label_not_blank check (btrim(label) <> ''),
  constraint application_document_requests_status_check
    check (status in ('requested', 'uploaded', 'accepted', 'rejected'))
);

create index application_document_requests_application_idx
  on public.application_document_requests (application_id, created_at);

create index application_document_requests_open_idx
  on public.application_document_requests (application_id, status)
  where status in ('requested', 'uploaded', 'rejected');

create table public.application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  request_id uuid not null references public.application_document_requests(id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  submitted_by text not null default 'applicant',
  uploaded_by_profile_id uuid references public.profiles(id) on delete set null,
  review_status text not null default 'uploaded',
  rejection_reason text,
  reviewed_by_profile_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint application_documents_filename_not_blank check (btrim(original_filename) <> ''),
  constraint application_documents_storage_path_not_blank check (btrim(storage_path) <> ''),
  constraint application_documents_size_check check (size_bytes > 0 and size_bytes <= 10485760),
  constraint application_documents_mime_type_check
    check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  constraint application_documents_submitted_by_check
    check (submitted_by in ('applicant', 'staff')),
  constraint application_documents_review_status_check
    check (review_status in ('uploaded', 'accepted', 'rejected')),
  constraint application_documents_rejection_reason_check
    check (review_status <> 'rejected' or nullif(btrim(rejection_reason), '') is not null)
);

create index application_documents_application_idx
  on public.application_documents (application_id, created_at desc);

create index application_documents_request_idx
  on public.application_documents (request_id, created_at desc);

create table public.application_access_links (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  token_hash text not null unique,
  purpose text not null default 'document_portal',
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null default (now() + interval '7 days'),
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint application_access_links_purpose_check check (purpose in ('document_portal')),
  constraint application_access_links_expiry_check check (expires_at > created_at)
);

create index application_access_links_application_idx
  on public.application_access_links (application_id, created_at desc);

create index application_access_links_active_idx
  on public.application_access_links (expires_at)
  where consumed_at is null and revoked_at is null;

create table public.application_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  session_token_hash text not null unique,
  expires_at timestamptz not null,
  last_accessed_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint application_portal_sessions_expiry_check check (expires_at > created_at)
);

create index application_portal_sessions_application_idx
  on public.application_portal_sessions (application_id, created_at desc);

create index application_portal_sessions_active_idx
  on public.application_portal_sessions (expires_at)
  where revoked_at is null;

alter table public.application_document_requests enable row level security;
alter table public.application_documents enable row level security;
alter table public.application_access_links enable row level security;
alter table public.application_portal_sessions enable row level security;

-- These tables intentionally have no anon/authenticated policies. CRM and
-- applicant operations go through role/token-checked server actions using the
-- narrowly scoped service-role client.

create trigger application_document_requests_set_updated_at
before update on public.application_document_requests
for each row execute function public.set_updated_at();

create trigger application_documents_set_updated_at
before update on public.application_documents
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'application-documents',
  'application-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


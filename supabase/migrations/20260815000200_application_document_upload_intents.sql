create table public.application_document_upload_intents (
  id uuid primary key default gen_random_uuid(),
  portal_session_id uuid not null references public.application_portal_sessions(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  request_id uuid not null references public.application_document_requests(id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint application_document_upload_intents_filename_not_blank check (btrim(original_filename) <> ''),
  constraint application_document_upload_intents_size_check check (size_bytes > 0 and size_bytes <= 10485760),
  constraint application_document_upload_intents_mime_type_check
    check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  constraint application_document_upload_intents_expiry_check check (expires_at > created_at)
);

create index application_document_upload_intents_session_idx
  on public.application_document_upload_intents (portal_session_id, created_at desc);

create index application_document_upload_intents_request_idx
  on public.application_document_upload_intents (request_id, created_at desc);

alter table public.application_document_upload_intents enable row level security;

-- Upload intents are service-role only. The browser receives only a scoped,
-- short-lived Storage upload token after its portal session is validated.


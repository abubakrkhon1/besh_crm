-- Single-use invitations let unauthenticated applicants submit the CRM's
-- application form without creating a Supabase Auth account.

alter table public.applications
  alter column auth_user_id drop not null;

alter table public.applications
  drop constraint if exists applications_auth_user_id_key;

create table public.application_invitations (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  token_hash text not null unique,
  invited_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  application_id uuid references public.applications(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint application_invitations_email_not_blank
    check (btrim(recipient_email) <> '')
);

create index application_invitations_recipient_email_idx
  on public.application_invitations (lower(recipient_email));

create index application_invitations_expires_at_idx
  on public.application_invitations (expires_at);

alter table public.application_invitations enable row level security;

-- Invitations are deliberately service-role only. Authenticated CRM users
-- access them through role-checked server actions; public applicants can only
-- resolve and consume a cryptographically random token through server code.


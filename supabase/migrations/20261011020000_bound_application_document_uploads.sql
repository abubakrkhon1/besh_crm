-- Bound applicant-controlled upload preparation transactionally. Per-file
-- validation remains in the application, while this function prevents a valid
-- portal session from creating unbounded intents or reserved storage paths.

alter table public.application_document_upload_intents
  add column if not exists invalidated_at timestamptz,
  add column if not exists invalidation_reason text;

update public.application_document_upload_intents
set invalidated_at = now(),
    invalidation_reason = 'expired_before_quota_enforcement'
where completed_at is null
  and invalidated_at is null
  and expires_at <= now();

update public.application_document_upload_intents as intent
set invalidated_at = now(),
    invalidation_reason = 'request_not_uploadable_before_quota_enforcement'
from public.application_document_requests as request
where request.id = intent.request_id
  and request.status not in ('requested', 'rejected')
  and intent.completed_at is null
  and intent.invalidated_at is null;

with duplicate_intents as (
  select id,
         row_number() over (partition by request_id order by created_at desc, id desc) as position
  from public.application_document_upload_intents
  where completed_at is null
    and invalidated_at is null
)
update public.application_document_upload_intents as intent
set invalidated_at = now(),
    invalidation_reason = 'superseded_before_quota_enforcement'
from duplicate_intents
where duplicate_intents.id = intent.id
  and duplicate_intents.position > 1;

create unique index if not exists application_document_upload_intents_one_active_request_idx
  on public.application_document_upload_intents (request_id)
  where completed_at is null and invalidated_at is null;

create or replace function public.create_application_document_upload_intent(
  p_portal_session_id uuid,
  p_application_id uuid,
  p_request_id uuid,
  p_storage_path text,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint
)
returns table(intent_id uuid, stale_storage_paths text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intent_id uuid;
  v_stale_paths text[];
  v_attempt_count integer;
  v_reserved_bytes bigint;
begin
  -- Serializes every preparation made with this portal capability.
  perform 1
  from public.application_portal_sessions as session
  where session.id = p_portal_session_id
    and session.application_id = p_application_id
    and session.expires_at > now()
    and session.revoked_at is null
  for update;

  if not found then
    raise exception using errcode = 'PT401', message = 'portal_session_invalid';
  end if;

  perform 1
  from public.application_document_requests as request
  where request.id = p_request_id
    and request.application_id = p_application_id
    and request.status in ('requested', 'rejected')
  for update;

  if not found then
    raise exception using errcode = 'PT409', message = 'document_request_not_uploadable';
  end if;

  if p_storage_path !~ ('^' || p_application_id::text || '/' || p_request_id::text || '/[0-9a-f-]+\\.(pdf|png|jpg)$') then
    raise exception using errcode = '22023', message = 'invalid_storage_path';
  end if;

  with stale as (
    update public.application_document_upload_intents
    set invalidated_at = now(), invalidation_reason = 'expired'
    where request_id = p_request_id
      and completed_at is null
      and invalidated_at is null
      and expires_at <= now()
    returning storage_path
  )
  select coalesce(array_agg(storage_path), array[]::text[])
  into v_stale_paths
  from stale;

  if exists (
    select 1
    from public.application_document_upload_intents
    where request_id = p_request_id
      and completed_at is null
      and invalidated_at is null
  ) then
    raise exception using errcode = 'PT409', message = 'upload_already_prepared';
  end if;

  select count(*), coalesce(sum(size_bytes), 0)
  into v_attempt_count, v_reserved_bytes
  from public.application_document_upload_intents
  where portal_session_id = p_portal_session_id;

  if v_attempt_count >= 20 or v_reserved_bytes + p_size_bytes > 104857600 then
    raise exception using errcode = 'PT429', message = 'upload_quota_exceeded';
  end if;

  insert into public.application_document_upload_intents (
    portal_session_id, application_id, request_id, storage_path,
    original_filename, mime_type, size_bytes
  ) values (
    p_portal_session_id, p_application_id, p_request_id, p_storage_path,
    p_original_filename, p_mime_type, p_size_bytes
  )
  returning id into v_intent_id;

  return query select v_intent_id, v_stale_paths;
end;
$$;

revoke all on function public.create_application_document_upload_intent(uuid, uuid, uuid, text, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.create_application_document_upload_intent(uuid, uuid, uuid, text, text, text, bigint)
  to service_role;

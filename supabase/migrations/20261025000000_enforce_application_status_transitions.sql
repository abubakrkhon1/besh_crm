-- Enforce the application workflow at the shared database boundary so browser,
-- direct PostgREST, and service-role writes cannot reverse a completed review.

create or replace function public.enforce_application_status_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending'
      or new.reviewed_at is not null
      or new.reviewed_by is not null
      or new.denial_reason is not null then
      raise exception 'New applications must begin in pending status'
        using errcode = '23514';
    end if;

    return new;
  end if;

  if new.status is not distinct from old.status then
    if row(new.reviewed_at, new.reviewed_by, new.denial_reason)
      is distinct from row(old.reviewed_at, old.reviewed_by, old.denial_reason) then
      if old.status in ('approved', 'denied') then
        raise exception 'A completed application decision is immutable'
          using errcode = '23514';
      end if;

      raise exception 'Review metadata may change only with a final decision'
        using errcode = '23514';
    end if;

    return new;
  end if;

  if old.status = 'pending' and new.status not in ('needs_documents', 'approved', 'denied') then
    raise exception 'Invalid application status transition'
      using errcode = '23514';
  elsif old.status = 'needs_documents' and new.status not in ('under_review', 'approved', 'denied') then
    raise exception 'Invalid application status transition'
      using errcode = '23514';
  elsif old.status = 'under_review' and new.status not in ('needs_documents', 'approved', 'denied') then
    raise exception 'Invalid application status transition'
      using errcode = '23514';
  elsif old.status in ('approved', 'denied') then
    raise exception 'A completed application decision is immutable'
      using errcode = '23514';
  end if;

  if new.status in ('approved', 'denied') then
    if auth.uid() is null then
      raise exception 'A completed application requires an authenticated reviewer'
        using errcode = '23514';
    end if;

    new.reviewed_at := now();
    new.reviewed_by := auth.uid();

    if new.status = 'approved' then
      new.denial_reason := null;
    end if;
  elsif row(new.reviewed_at, new.reviewed_by, new.denial_reason)
      is distinct from row(old.reviewed_at, old.reviewed_by, old.denial_reason) then
    raise exception 'Review metadata may change only with a final decision'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_application_status_transition on public.applications;
drop trigger if exists enforce_application_initial_status on public.applications;

create trigger enforce_application_initial_status
before insert on public.applications
for each row
execute function public.enforce_application_status_transition();

create trigger enforce_application_status_transition
before update of status, reviewed_at, reviewed_by, denial_reason
on public.applications
for each row
execute function public.enforce_application_status_transition();

revoke all on function public.enforce_application_status_transition() from public;

create or replace function public.guard_completed_application_workflow()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_application_id uuid;
  application_status text;
begin
  if tg_op = 'DELETE' then
    target_application_id := old.application_id;
  else
    target_application_id := new.application_id;
  end if;

  select status
  into application_status
  from public.applications
  where id = target_application_id
  for update;

  if application_status in ('approved', 'denied') then
    raise exception 'A completed application document workflow is immutable'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_completed_application_document_requests on public.application_document_requests;
create trigger guard_completed_application_document_requests
before insert or update or delete on public.application_document_requests
for each row
execute function public.guard_completed_application_workflow();

drop trigger if exists guard_completed_application_documents on public.application_documents;
create trigger guard_completed_application_documents
before insert or update or delete on public.application_documents
for each row
execute function public.guard_completed_application_workflow();

revoke all on function public.guard_completed_application_workflow() from public;

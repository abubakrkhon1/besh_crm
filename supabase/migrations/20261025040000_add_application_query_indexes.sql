create index if not exists applications_created_at_id_desc_idx
  on public.applications (created_at desc, id desc);

create index if not exists applications_status_created_at_id_desc_idx
  on public.applications (status, created_at desc, id desc);

create index if not exists applications_approved_reviewed_at_idx
  on public.applications (reviewed_at desc, id)
  where status = 'approved';

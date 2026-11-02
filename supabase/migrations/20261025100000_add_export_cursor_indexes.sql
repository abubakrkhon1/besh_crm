-- Stable descending cursors keep large filtered exports index-backed.
create index if not exists leads_created_id_desc_idx
  on public.leads (created_at desc, id desc);

create index if not exists applications_created_id_desc_idx
  on public.applications (created_at desc, id desc);

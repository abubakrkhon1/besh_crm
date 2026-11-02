-- Add the UUID tie-breaker used by the paginated lead activity timeline.
create index if not exists lead_activities_lead_created_id_idx
  on public.lead_activities (lead_id, created_at desc, id desc);

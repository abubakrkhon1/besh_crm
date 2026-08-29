-- Broadcast newly recorded lead activity so open lead panels update without a
-- manual refresh. The guard keeps this migration safe if Realtime was enabled
-- manually before the migration ran.

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'lead_activities'
  ) then
    alter publication supabase_realtime add table public.lead_activities;
  end if;
end $$;


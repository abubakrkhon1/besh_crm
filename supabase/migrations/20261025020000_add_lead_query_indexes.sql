-- Support bounded dashboard reads and the server-paginated leads workspace.
-- PostgreSQL can use these indexes while still applying tenant/team RLS filters.

create index if not exists leads_created_at_id_desc_idx
  on public.leads (created_at desc, id desc);

create index if not exists leads_assigned_created_at_id_desc_idx
  on public.leads (assigned_to_profile_id, created_at desc, id desc);

create index if not exists leads_manager_created_at_id_desc_idx
  on public.leads (sales_manager_profile_id, created_at desc, id desc);

create index if not exists leads_status_created_at_id_desc_idx
  on public.leads (status, created_at desc, id desc);

create index if not exists leads_open_attention_idx
  on public.leads (sales_manager_profile_id, priority, next_follow_up_at, created_at, id)
  where status in ('new', 'on_the_process', 'follow_up');

create index if not exists leads_agent_open_attention_idx
  on public.leads (assigned_to_profile_id, priority, next_follow_up_at, created_at, id)
  where status in ('new', 'on_the_process', 'follow_up');

create index if not exists profiles_manager_active_agents_idx
  on public.profiles (manager_profile_id, full_name, id)
  where role = 'sales_agent'::public.user_role and is_active;

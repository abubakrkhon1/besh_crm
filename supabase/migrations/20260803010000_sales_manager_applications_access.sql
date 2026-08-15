create policy applications_sales_manager_select
on public.applications
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.auth_user_id = auth.uid()
      and profiles.role = 'sales_manager'
      and profiles.is_active = true
  )
);

create policy applications_sales_manager_update
on public.applications
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.auth_user_id = auth.uid()
      and profiles.role = 'sales_manager'
      and profiles.is_active = true
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.auth_user_id = auth.uid()
      and profiles.role = 'sales_manager'
      and profiles.is_active = true
  )
);

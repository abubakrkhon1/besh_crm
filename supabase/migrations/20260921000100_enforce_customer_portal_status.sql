-- Portal access exists only while the linked customer is active. Enforce this
-- in the database so direct REST calls and server actions cannot bypass it.

create or replace function public.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select profile.customer_id
  from public.profiles as profile
  join public.customers as customer on customer.id = profile.customer_id
  where profile.auth_user_id = auth.uid()
    and profile.is_active
    and profile.role::text = 'customer_admin'
    and customer.status = 'active'
  limit 1;
$$;

revoke all on function public.current_customer_id() from public;
grant execute on function public.current_customer_id() to authenticated;

create or replace function public.sync_customer_portal_profile_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    update public.profiles
    set is_active = (new.status = 'active'),
        updated_at = now()
    where customer_id = new.id
      and role::text = 'customer_admin';
  end if;
  return new;
end;
$$;

revoke all on function public.sync_customer_portal_profile_status() from public, anon, authenticated;

drop trigger if exists customers_sync_portal_profile_status on public.customers;
create trigger customers_sync_portal_profile_status
after update of status on public.customers
for each row execute function public.sync_customer_portal_profile_status();

update public.profiles as profile
set is_active = (customer.status = 'active'),
    updated_at = now()
from public.customers as customer
where profile.customer_id = customer.id
  and profile.role::text = 'customer_admin'
  and profile.is_active is distinct from (customer.status = 'active');

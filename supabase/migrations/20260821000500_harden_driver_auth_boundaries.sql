-- Driver accounts must never be able to promote their own profile role.
-- Profile changes that affect authorization remain CRM/service controlled.

drop policy if exists profiles_update_own on public.profiles;

-- Retain self-service reads, but make the definition explicit and require an
-- active profile. Other CRM hierarchy policies continue to apply separately.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
to authenticated
using (auth_user_id = auth.uid() and is_active);

-- Defense in depth: a driver can never mutate invitation rows even if a broad
-- grant is introduced later. Current invitation writes already require full CRM
-- access through RLS.
revoke insert, update, delete on table public.driver_invitations from anon;
revoke insert, update, delete on table public.driver_invitations from authenticated;

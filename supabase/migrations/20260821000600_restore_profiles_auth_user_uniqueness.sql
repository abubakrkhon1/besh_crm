-- Each Supabase Auth identity may own exactly one CRM profile. A historical
-- remote-schema migration removed the original constraint and left only a
-- non-unique lookup index, weakening the identity invariant.
create unique index if not exists profiles_auth_user_id_unique
  on public.profiles(auth_user_id);

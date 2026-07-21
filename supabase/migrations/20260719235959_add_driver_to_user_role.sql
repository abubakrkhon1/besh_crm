-- Driver is an active Besh Mobile role. Keep this in its own migration so
-- PostgreSQL commits the new enum value before later migrations use it in
-- profiles.role casts and defaults.

alter type public.user_role
  add value if not exists 'driver';


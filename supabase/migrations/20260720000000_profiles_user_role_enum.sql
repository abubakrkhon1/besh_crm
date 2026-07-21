-- Convert profiles.role from the legacy text field to public.user_role.
-- Legacy mapping:
--   admin  -> admin
--   driver -> driver (active mobile-app role; preserved)
--   viewer -> support (obsolete read-only CRM role)

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'user_role'
  ) then
    create type public.user_role as enum (
      'owner',
      'admin',
      'driver',
      'general_manager',
      'sales_manager',
      'sales_representative',
      'accounting',
      'compliance',
      'support',
      'marketing'
    );
  end if;
end $$;

-- Fail with a useful message if a previously created enum is incomplete.
do $$
declare
  missing_roles text[];
begin
  select array_agg(required_role order by required_role)
  into missing_roles
  from unnest(array[
    'owner',
    'admin',
    'driver',
    'general_manager',
    'sales_manager',
    'sales_representative',
    'accounting',
    'compliance',
    'support',
    'marketing'
  ]) as required_roles(required_role)
  where not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'user_role'
      and e.enumlabel = required_role
  );

  if missing_roles is not null then
    raise exception 'public.user_role is missing values: %', missing_roles;
  end if;
end $$;

-- A text default cannot be automatically cast while changing the column type.
alter table public.profiles
  alter column role drop default;

-- Remove the old admin/driver/viewer-only validation.
alter table public.profiles
  drop constraint if exists profiles_role_check;

-- PostgreSQL will not change a column type while an RLS policy depends on that
-- column. Preserve the exact policy definitions so they can be restored after
-- the conversion. This includes policies on other tables whose expressions
-- query profiles.role.
create temporary table profiles_role_policy_backup
on commit drop
as
select
  policies.schemaname,
  policies.tablename,
  policies.policyname,
  policies.permissive,
  policies.roles,
  policies.cmd,
  policies.qual,
  policies.with_check
from pg_policies as policies
join pg_policy as policy_catalog
  on policy_catalog.polname = policies.policyname
 and policy_catalog.polrelid = format('%I.%I', policies.schemaname, policies.tablename)::regclass
where exists (
  select 1
  from pg_depend as dependency
  where dependency.classid = 'pg_policy'::regclass
    and dependency.objid = policy_catalog.oid
    and dependency.refclassid = 'pg_class'::regclass
    and dependency.refobjid = 'public.profiles'::regclass
    and dependency.refobjsubid = (
      select attribute.attnum
      from pg_attribute as attribute
      where attribute.attrelid = 'public.profiles'::regclass
        and attribute.attname = 'role'
        and not attribute.attisdropped
    )
);

do $$
declare
  saved_policy record;
begin
  for saved_policy in
    select * from profiles_role_policy_backup
  loop
    execute format(
      'drop policy %I on %I.%I',
      saved_policy.policyname,
      saved_policy.schemaname,
      saved_policy.tablename
    );
  end loop;
end $$;

-- Convert both current legacy values and any already-valid new values.
alter table public.profiles
  alter column role type public.user_role
  using (
    case role
      when 'viewer' then 'support'
      else role
    end
  )::public.user_role;

-- Restore every policy removed above with its original definition.
do $$
declare
  saved_policy record;
  policy_roles text;
  policy_sql text;
  policy_qual text;
  policy_with_check text;
begin
  for saved_policy in
    select * from profiles_role_policy_backup
  loop
    select string_agg(
      case
        when role_name = 'public' then 'public'
        else quote_ident(role_name)
      end,
      ', '
    )
    into policy_roles
    from unnest(saved_policy.roles) as role_names(role_name);

    policy_sql := format(
      'create policy %I on %I.%I as %s for %s to %s',
      saved_policy.policyname,
      saved_policy.schemaname,
      saved_policy.tablename,
      saved_policy.permissive,
      saved_policy.cmd,
      coalesce(policy_roles, 'public')
    );

    -- Legacy policies compare the former text column to text literals. Cast the
    -- role column back to text inside those expressions so their behavior stays
    -- unchanged after profiles.role becomes an enum.
    policy_qual := replace(
      replace(
        replace(saved_policy.qual, 'role =', 'role::text ='),
        'role <>', 'role::text <>'
      ),
      'role !=', 'role::text !='
    );

    policy_with_check := replace(
      replace(
        replace(saved_policy.with_check, 'role =', 'role::text ='),
        'role <>', 'role::text <>'
      ),
      'role !=', 'role::text !='
    );

    if policy_qual is not null then
      policy_sql := policy_sql || format(' using (%s)', policy_qual);
    end if;

    if policy_with_check is not null then
      policy_sql := policy_sql || format(' with check (%s)', policy_with_check);
    end if;

    execute policy_sql;
  end loop;
end $$;

-- Preserve the mobile-app onboarding behavior. CRM staff roles must be assigned
-- explicitly by an owner/admin workflow.
alter table public.profiles
  alter column role set default 'driver'::public.user_role;

-- Keep the existing role index. PostgreSQL rebuilds its column dependency when
-- ALTER COLUMN TYPE succeeds; this statement is harmless if it already exists.
create index if not exists profiles_role_idx
  on public.profiles using btree (role);

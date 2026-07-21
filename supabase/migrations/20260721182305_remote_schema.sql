drop extension if exists "pg_net";

drop policy "applications_admin_all" on "public"."applications";

drop policy "profiles_self_select" on "public"."profiles";

alter table "public"."profiles" drop constraint "profiles_auth_user_id_key";

drop index if exists "public"."profiles_auth_user_id_key";


  create table "public"."activity_logs" (
    "id" uuid not null default gen_random_uuid(),
    "entity_type" text not null,
    "entity_id" uuid not null,
    "action" text not null,
    "description" text,
    "metadata" jsonb not null default '{}'::jsonb,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."activity_logs" enable row level security;


  create table "public"."documents" (
    "id" uuid not null default gen_random_uuid(),
    "entity_type" text not null,
    "entity_id" uuid not null,
    "name" text not null,
    "file_path" text not null,
    "file_type" text,
    "uploaded_by" uuid,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."documents" enable row level security;


  create table "public"."fuel_card_restrictions" (
    "id" uuid not null default gen_random_uuid(),
    "fuel_card_id" uuid not null,
    "fuel_only" boolean not null default true,
    "allow_def" boolean not null default true,
    "allow_maintenance" boolean not null default false,
    "allowed_states" text[],
    "blocked_states" text[],
    "allowed_merchants" text[],
    "blocked_merchants" text[],
    "start_time" time without time zone,
    "end_time" time without time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."fuel_card_restrictions" enable row level security;


  create table "public"."notes" (
    "id" uuid not null default gen_random_uuid(),
    "entity_type" text not null,
    "entity_id" uuid not null,
    "body" text not null,
    "created_by" uuid,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."notes" enable row level security;

alter table "public"."profiles" alter column "id" drop default;

CREATE INDEX activity_logs_created_at_idx ON public.activity_logs USING btree (created_at DESC);

CREATE INDEX activity_logs_entity_idx ON public.activity_logs USING btree (entity_type, entity_id);

CREATE UNIQUE INDEX activity_logs_pkey ON public.activity_logs USING btree (id);

CREATE INDEX applications_auth_user_id_idx ON public.applications USING btree (auth_user_id);

CREATE UNIQUE INDEX applications_auth_user_id_key ON public.applications USING btree (auth_user_id);

CREATE INDEX applications_status_idx ON public.applications USING btree (status);

CREATE INDEX customers_auth_user_id_idx ON public.customers USING btree (auth_user_id);

CREATE INDEX customers_email_idx ON public.customers USING btree (lower(email));

CREATE INDEX customers_status_idx ON public.customers USING btree (status);

CREATE INDEX documents_entity_idx ON public.documents USING btree (entity_type, entity_id);

CREATE UNIQUE INDEX documents_pkey ON public.documents USING btree (id);

CREATE INDEX documents_uploaded_by_idx ON public.documents USING btree (uploaded_by);

CREATE INDEX drivers_customer_id_idx ON public.drivers USING btree (customer_id);

CREATE INDEX drivers_email_idx ON public.drivers USING btree (lower(email));

CREATE INDEX drivers_status_idx ON public.drivers USING btree (status);

CREATE UNIQUE INDEX fuel_card_restrictions_card_unique ON public.fuel_card_restrictions USING btree (fuel_card_id);

CREATE UNIQUE INDEX fuel_card_restrictions_pkey ON public.fuel_card_restrictions USING btree (id);

CREATE INDEX fuel_cards_customer_id_idx ON public.fuel_cards USING btree (customer_id);

CREATE INDEX fuel_cards_driver_id_idx ON public.fuel_cards USING btree (driver_id);

CREATE INDEX fuel_cards_last4_idx ON public.fuel_cards USING btree (card_last4);

CREATE INDEX fuel_cards_status_idx ON public.fuel_cards USING btree (status);

CREATE INDEX fuel_transactions_customer_id_idx ON public.fuel_transactions USING btree (customer_id);

CREATE INDEX fuel_transactions_date_idx ON public.fuel_transactions USING btree (transaction_date DESC);

CREATE INDEX fuel_transactions_driver_id_idx ON public.fuel_transactions USING btree (driver_id);

CREATE INDEX fuel_transactions_fuel_card_id_idx ON public.fuel_transactions USING btree (fuel_card_id);

CREATE INDEX fuel_transactions_status_idx ON public.fuel_transactions USING btree (status);

CREATE INDEX notes_created_by_idx ON public.notes USING btree (created_by);

CREATE INDEX notes_entity_idx ON public.notes USING btree (entity_type, entity_id);

CREATE UNIQUE INDEX notes_pkey ON public.notes USING btree (id);

alter table "public"."activity_logs" add constraint "activity_logs_pkey" PRIMARY KEY using index "activity_logs_pkey";

alter table "public"."documents" add constraint "documents_pkey" PRIMARY KEY using index "documents_pkey";

alter table "public"."fuel_card_restrictions" add constraint "fuel_card_restrictions_pkey" PRIMARY KEY using index "fuel_card_restrictions_pkey";

alter table "public"."notes" add constraint "notes_pkey" PRIMARY KEY using index "notes_pkey";

alter table "public"."activity_logs" add constraint "activity_logs_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."activity_logs" validate constraint "activity_logs_created_by_fkey";

alter table "public"."activity_logs" add constraint "activity_logs_entity_type_check" CHECK ((entity_type = ANY (ARRAY['customer'::text, 'driver'::text, 'fuel_card'::text, 'application'::text, 'transaction'::text]))) not valid;

alter table "public"."activity_logs" validate constraint "activity_logs_entity_type_check";

alter table "public"."applications" add constraint "applications_auth_user_id_key" UNIQUE using index "applications_auth_user_id_key";

alter table "public"."documents" add constraint "documents_entity_type_check" CHECK ((entity_type = ANY (ARRAY['customer'::text, 'driver'::text, 'fuel_card'::text, 'application'::text]))) not valid;

alter table "public"."documents" validate constraint "documents_entity_type_check";

alter table "public"."documents" add constraint "documents_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."documents" validate constraint "documents_uploaded_by_fkey";

alter table "public"."fuel_card_restrictions" add constraint "fuel_card_restrictions_fuel_card_id_fkey" FOREIGN KEY (fuel_card_id) REFERENCES public.fuel_cards(id) ON DELETE CASCADE not valid;

alter table "public"."fuel_card_restrictions" validate constraint "fuel_card_restrictions_fuel_card_id_fkey";

alter table "public"."notes" add constraint "notes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."notes" validate constraint "notes_created_by_fkey";

alter table "public"."notes" add constraint "notes_entity_type_check" CHECK ((entity_type = ANY (ARRAY['customer'::text, 'driver'::text, 'fuel_card'::text, 'application'::text, 'transaction'::text]))) not valid;

alter table "public"."notes" validate constraint "notes_entity_type_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, auth_user_id, full_name, email, role)
  VALUES (
    NEW.id,
    NEW.id,
    -- full_name passed via supabase.auth.signUp({ options: { data: { full_name } } })
    NEW.raw_user_meta_data ->> 'full_name',
    NEW.email,
    'driver'  -- All new signups default to driver; admin must be assigned manually
  )
  ON CONFLICT (id) DO NOTHING;  -- Idempotent — safe to run twice

  RETURN NEW;
END;
$function$
;

grant delete on table "public"."activity_logs" to "anon";

grant insert on table "public"."activity_logs" to "anon";

grant references on table "public"."activity_logs" to "anon";

grant select on table "public"."activity_logs" to "anon";

grant trigger on table "public"."activity_logs" to "anon";

grant truncate on table "public"."activity_logs" to "anon";

grant update on table "public"."activity_logs" to "anon";

grant delete on table "public"."activity_logs" to "authenticated";

grant insert on table "public"."activity_logs" to "authenticated";

grant references on table "public"."activity_logs" to "authenticated";

grant select on table "public"."activity_logs" to "authenticated";

grant trigger on table "public"."activity_logs" to "authenticated";

grant truncate on table "public"."activity_logs" to "authenticated";

grant update on table "public"."activity_logs" to "authenticated";

grant delete on table "public"."activity_logs" to "service_role";

grant insert on table "public"."activity_logs" to "service_role";

grant references on table "public"."activity_logs" to "service_role";

grant select on table "public"."activity_logs" to "service_role";

grant trigger on table "public"."activity_logs" to "service_role";

grant truncate on table "public"."activity_logs" to "service_role";

grant update on table "public"."activity_logs" to "service_role";

grant delete on table "public"."applications" to "anon";

grant insert on table "public"."applications" to "anon";

grant select on table "public"."applications" to "anon";

grant update on table "public"."applications" to "anon";

grant delete on table "public"."applications" to "authenticated";

grant insert on table "public"."applications" to "authenticated";

grant select on table "public"."applications" to "authenticated";

grant update on table "public"."applications" to "authenticated";

grant delete on table "public"."applications" to "service_role";

grant insert on table "public"."applications" to "service_role";

grant select on table "public"."applications" to "service_role";

grant update on table "public"."applications" to "service_role";

grant delete on table "public"."customers" to "anon";

grant insert on table "public"."customers" to "anon";

grant select on table "public"."customers" to "anon";

grant update on table "public"."customers" to "anon";

grant delete on table "public"."customers" to "authenticated";

grant insert on table "public"."customers" to "authenticated";

grant select on table "public"."customers" to "authenticated";

grant update on table "public"."customers" to "authenticated";

grant delete on table "public"."customers" to "service_role";

grant insert on table "public"."customers" to "service_role";

grant select on table "public"."customers" to "service_role";

grant update on table "public"."customers" to "service_role";

grant delete on table "public"."documents" to "anon";

grant insert on table "public"."documents" to "anon";

grant references on table "public"."documents" to "anon";

grant select on table "public"."documents" to "anon";

grant trigger on table "public"."documents" to "anon";

grant truncate on table "public"."documents" to "anon";

grant update on table "public"."documents" to "anon";

grant delete on table "public"."documents" to "authenticated";

grant insert on table "public"."documents" to "authenticated";

grant references on table "public"."documents" to "authenticated";

grant select on table "public"."documents" to "authenticated";

grant trigger on table "public"."documents" to "authenticated";

grant truncate on table "public"."documents" to "authenticated";

grant update on table "public"."documents" to "authenticated";

grant delete on table "public"."documents" to "service_role";

grant insert on table "public"."documents" to "service_role";

grant references on table "public"."documents" to "service_role";

grant select on table "public"."documents" to "service_role";

grant trigger on table "public"."documents" to "service_role";

grant truncate on table "public"."documents" to "service_role";

grant update on table "public"."documents" to "service_role";

grant delete on table "public"."drivers" to "anon";

grant insert on table "public"."drivers" to "anon";

grant select on table "public"."drivers" to "anon";

grant update on table "public"."drivers" to "anon";

grant delete on table "public"."drivers" to "authenticated";

grant insert on table "public"."drivers" to "authenticated";

grant select on table "public"."drivers" to "authenticated";

grant update on table "public"."drivers" to "authenticated";

grant delete on table "public"."drivers" to "service_role";

grant insert on table "public"."drivers" to "service_role";

grant select on table "public"."drivers" to "service_role";

grant update on table "public"."drivers" to "service_role";

grant delete on table "public"."fuel_card_customer_mappings" to "anon";

grant insert on table "public"."fuel_card_customer_mappings" to "anon";

grant select on table "public"."fuel_card_customer_mappings" to "anon";

grant update on table "public"."fuel_card_customer_mappings" to "anon";

grant delete on table "public"."fuel_card_customer_mappings" to "authenticated";

grant insert on table "public"."fuel_card_customer_mappings" to "authenticated";

grant select on table "public"."fuel_card_customer_mappings" to "authenticated";

grant update on table "public"."fuel_card_customer_mappings" to "authenticated";

grant delete on table "public"."fuel_card_customer_mappings" to "service_role";

grant insert on table "public"."fuel_card_customer_mappings" to "service_role";

grant select on table "public"."fuel_card_customer_mappings" to "service_role";

grant update on table "public"."fuel_card_customer_mappings" to "service_role";

grant delete on table "public"."fuel_card_restrictions" to "anon";

grant insert on table "public"."fuel_card_restrictions" to "anon";

grant references on table "public"."fuel_card_restrictions" to "anon";

grant select on table "public"."fuel_card_restrictions" to "anon";

grant trigger on table "public"."fuel_card_restrictions" to "anon";

grant truncate on table "public"."fuel_card_restrictions" to "anon";

grant update on table "public"."fuel_card_restrictions" to "anon";

grant delete on table "public"."fuel_card_restrictions" to "authenticated";

grant insert on table "public"."fuel_card_restrictions" to "authenticated";

grant references on table "public"."fuel_card_restrictions" to "authenticated";

grant select on table "public"."fuel_card_restrictions" to "authenticated";

grant trigger on table "public"."fuel_card_restrictions" to "authenticated";

grant truncate on table "public"."fuel_card_restrictions" to "authenticated";

grant update on table "public"."fuel_card_restrictions" to "authenticated";

grant delete on table "public"."fuel_card_restrictions" to "service_role";

grant insert on table "public"."fuel_card_restrictions" to "service_role";

grant references on table "public"."fuel_card_restrictions" to "service_role";

grant select on table "public"."fuel_card_restrictions" to "service_role";

grant trigger on table "public"."fuel_card_restrictions" to "service_role";

grant truncate on table "public"."fuel_card_restrictions" to "service_role";

grant update on table "public"."fuel_card_restrictions" to "service_role";

grant delete on table "public"."fuel_card_sync_runs" to "anon";

grant insert on table "public"."fuel_card_sync_runs" to "anon";

grant select on table "public"."fuel_card_sync_runs" to "anon";

grant update on table "public"."fuel_card_sync_runs" to "anon";

grant delete on table "public"."fuel_card_sync_runs" to "authenticated";

grant insert on table "public"."fuel_card_sync_runs" to "authenticated";

grant select on table "public"."fuel_card_sync_runs" to "authenticated";

grant update on table "public"."fuel_card_sync_runs" to "authenticated";

grant delete on table "public"."fuel_card_sync_runs" to "service_role";

grant insert on table "public"."fuel_card_sync_runs" to "service_role";

grant select on table "public"."fuel_card_sync_runs" to "service_role";

grant update on table "public"."fuel_card_sync_runs" to "service_role";

grant delete on table "public"."fuel_cards" to "anon";

grant insert on table "public"."fuel_cards" to "anon";

grant select on table "public"."fuel_cards" to "anon";

grant update on table "public"."fuel_cards" to "anon";

grant delete on table "public"."fuel_cards" to "authenticated";

grant insert on table "public"."fuel_cards" to "authenticated";

grant select on table "public"."fuel_cards" to "authenticated";

grant update on table "public"."fuel_cards" to "authenticated";

grant delete on table "public"."fuel_cards" to "service_role";

grant insert on table "public"."fuel_cards" to "service_role";

grant select on table "public"."fuel_cards" to "service_role";

grant update on table "public"."fuel_cards" to "service_role";

grant delete on table "public"."fuel_transactions" to "anon";

grant insert on table "public"."fuel_transactions" to "anon";

grant select on table "public"."fuel_transactions" to "anon";

grant update on table "public"."fuel_transactions" to "anon";

grant delete on table "public"."fuel_transactions" to "authenticated";

grant insert on table "public"."fuel_transactions" to "authenticated";

grant select on table "public"."fuel_transactions" to "authenticated";

grant update on table "public"."fuel_transactions" to "authenticated";

grant delete on table "public"."fuel_transactions" to "service_role";

grant insert on table "public"."fuel_transactions" to "service_role";

grant select on table "public"."fuel_transactions" to "service_role";

grant update on table "public"."fuel_transactions" to "service_role";

grant delete on table "public"."leads" to "anon";

grant insert on table "public"."leads" to "anon";

grant select on table "public"."leads" to "anon";

grant update on table "public"."leads" to "anon";

grant delete on table "public"."leads" to "service_role";

grant insert on table "public"."leads" to "service_role";

grant select on table "public"."leads" to "service_role";

grant update on table "public"."leads" to "service_role";

grant delete on table "public"."notes" to "anon";

grant insert on table "public"."notes" to "anon";

grant references on table "public"."notes" to "anon";

grant select on table "public"."notes" to "anon";

grant trigger on table "public"."notes" to "anon";

grant truncate on table "public"."notes" to "anon";

grant update on table "public"."notes" to "anon";

grant delete on table "public"."notes" to "authenticated";

grant insert on table "public"."notes" to "authenticated";

grant references on table "public"."notes" to "authenticated";

grant select on table "public"."notes" to "authenticated";

grant trigger on table "public"."notes" to "authenticated";

grant truncate on table "public"."notes" to "authenticated";

grant update on table "public"."notes" to "authenticated";

grant delete on table "public"."notes" to "service_role";

grant insert on table "public"."notes" to "service_role";

grant references on table "public"."notes" to "service_role";

grant select on table "public"."notes" to "service_role";

grant trigger on table "public"."notes" to "service_role";

grant truncate on table "public"."notes" to "service_role";

grant update on table "public"."notes" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";


  create policy "activity_logs_admin_all"
  on "public"."activity_logs"
  as permissive
  for all
  to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));



  create policy "Admins can update all applications"
  on "public"."applications"
  as permissive
  for update
  to public
using (public.is_admin(auth.uid()));



  create policy "Admins can view all applications"
  on "public"."applications"
  as permissive
  for select
  to public
using (public.is_admin(auth.uid()));



  create policy "Applicants can insert own applications"
  on "public"."applications"
  as permissive
  for insert
  to public
with check ((auth_user_id = auth.uid()));



  create policy "Applicants can view own applications"
  on "public"."applications"
  as permissive
  for select
  to public
using ((auth_user_id = auth.uid()));



  create policy "applications_admin_select_all"
  on "public"."applications"
  as permissive
  for select
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role)::text = 'admin'::text)))));



  create policy "applications_admin_update"
  on "public"."applications"
  as permissive
  for update
  to authenticated
using ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role)::text = 'admin'::text)))))
with check ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND ((p.role)::text = 'admin'::text)))));



  create policy "applications_insert_own"
  on "public"."applications"
  as permissive
  for insert
  to authenticated
with check ((auth_user_id = auth.uid()));



  create policy "applications_select_own"
  on "public"."applications"
  as permissive
  for select
  to authenticated
using ((auth_user_id = auth.uid()));



  create policy "documents_admin_all"
  on "public"."documents"
  as permissive
  for all
  to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));



  create policy "fuel_card_restrictions_admin_all"
  on "public"."fuel_card_restrictions"
  as permissive
  for all
  to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));



  create policy "notes_admin_all"
  on "public"."notes"
  as permissive
  for all
  to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));



  create policy "profiles_admin_select"
  on "public"."profiles"
  as permissive
  for select
  to authenticated
using (public.is_admin(auth.uid()));



  create policy "profiles_admin_update"
  on "public"."profiles"
  as permissive
  for update
  to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));



  create policy "profiles_select_own"
  on "public"."profiles"
  as permissive
  for select
  to authenticated
using ((auth_user_id = auth.uid()));



  create policy "profiles_update_own"
  on "public"."profiles"
  as permissive
  for update
  to authenticated
using ((auth_user_id = auth.uid()))
with check ((auth_user_id = auth.uid()));


CREATE TRIGGER set_fuel_card_restrictions_updated_at BEFORE UPDATE ON public.fuel_card_restrictions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();



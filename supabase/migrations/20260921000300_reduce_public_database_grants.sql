-- RLS remains the primary row boundary, but unnecessary grants increase the
-- blast radius of a future policy mistake. Anonymous users need no direct CRM
-- database access; provider-owned and identity data is server-controlled.

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;

revoke insert, update, delete on table public.profiles from authenticated;
revoke insert, delete on table public.customers from authenticated;
revoke insert, update, delete on table public.drivers from authenticated;
revoke insert, update, delete on table public.fuel_cards from authenticated;
revoke insert, update, delete on table public.fuel_transactions from authenticated;
revoke insert, update, delete on table public.fuel_card_customer_mappings from authenticated;
revoke insert, update, delete on table public.fuel_card_sync_runs from authenticated;
revoke insert, update, delete on table public.fuel_card_restrictions from authenticated;
revoke insert, update, delete on table public.fuel_card_operations from authenticated;
revoke insert, update, delete on table public.driver_invitations from authenticated;

revoke insert, update, delete on table public.wex_sync_jobs from authenticated;
revoke insert, update, delete on table public.wex_sync_state from authenticated;
revoke insert, update, delete on table public.wex_sync_alerts from authenticated;
revoke insert, update, delete on table public.wex_worker_leases from authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

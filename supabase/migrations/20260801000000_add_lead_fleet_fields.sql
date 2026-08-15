-- Add sales qualification details used by the My Leads workspace.
alter table public.leads
  add column if not exists fleet_size integer,
  add column if not exists preferred_network text,
  add column if not exists estimated_monthly_gallons integer;

alter table public.leads
  drop constraint if exists leads_fleet_size_nonnegative,
  add constraint leads_fleet_size_nonnegative
    check (fleet_size is null or fleet_size >= 0),
  drop constraint if exists leads_estimated_monthly_gallons_nonnegative,
  add constraint leads_estimated_monthly_gallons_nonnegative
    check (estimated_monthly_gallons is null or estimated_monthly_gallons >= 0);

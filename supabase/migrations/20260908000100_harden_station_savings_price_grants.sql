revoke all privileges on table public.station_savings_prices from anon;
revoke all privileges on table public.station_savings_prices from authenticated;
grant select on table public.station_savings_prices to authenticated;
grant all privileges on table public.station_savings_prices to service_role;

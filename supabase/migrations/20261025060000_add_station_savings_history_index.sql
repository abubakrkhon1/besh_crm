-- Keep effective-dated pricing history pagination index-backed as the table grows.
create index if not exists station_savings_prices_history_idx
  on public.station_savings_prices (effective_from desc, updated_at desc, id desc);

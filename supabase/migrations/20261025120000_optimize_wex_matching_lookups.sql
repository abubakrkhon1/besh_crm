create index if not exists fuel_card_customer_mappings_confirmed_card_idx
  on public.fuel_card_customer_mappings (fuel_card_id)
  include (customer_id)
  where is_confirmed = true;

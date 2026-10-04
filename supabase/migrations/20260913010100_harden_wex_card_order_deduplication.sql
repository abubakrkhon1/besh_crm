alter table public.fuel_card_operations
  add column if not exists request_fingerprint text;

create unique index if not exists fuel_card_operations_issue_fingerprint_unique
  on public.fuel_card_operations(operation_type, request_fingerprint)
  where operation_type = 'issue' and request_fingerprint is not null;

comment on column public.fuel_card_operations.request_fingerprint is
  'One-way same-business-day fingerprint used to prevent duplicate physical-card orders after uncertain responses.';

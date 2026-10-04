-- Extend the audited provider-operation vocabulary for replacement cards.
alter table public.fuel_card_operations
  drop constraint if exists fuel_card_operations_operation_type_check;

alter table public.fuel_card_operations
  add constraint fuel_card_operations_operation_type_check
  check (operation_type in (
    'freeze', 'unfreeze', 'set_limits', 'issue',
    'replace_lost', 'replace_stolen', 'reissue_damaged'
  ));

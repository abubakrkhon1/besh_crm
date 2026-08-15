alter table public.leads
  add column if not exists account_type text;

update public.leads
set account_type = 'prepaid_account'
where account_type is null;

alter table public.leads
  alter column account_type set default 'prepaid_account',
  alter column account_type set not null,
  drop constraint if exists leads_account_type_valid,
  add constraint leads_account_type_valid
    check (account_type in ('prepaid_account', 'deposit', 'credit_line'));

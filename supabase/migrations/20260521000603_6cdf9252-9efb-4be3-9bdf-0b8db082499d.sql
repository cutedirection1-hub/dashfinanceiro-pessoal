
alter table public.card_transactions
  add column if not exists recurrence text not null default 'none',
  add column if not exists recurrence_group_id uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'card_transactions_recurrence_check') then
    alter table public.card_transactions
      add constraint card_transactions_recurrence_check
      check (recurrence in ('none','monthly','yearly'));
  end if;
end $$;

create index if not exists idx_card_tx_recur on public.card_transactions(recurrence_group_id);

create table if not exists public.investment_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  investment_id uuid not null,
  amount numeric not null,
  occurred_on date not null default current_date,
  funding_account_id uuid,
  account_tx_id uuid,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.investment_contributions enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='investment_contributions' and policyname='contrib_all_own') then
    create policy contrib_all_own on public.investment_contributions
      for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

create index if not exists idx_contrib_inv on public.investment_contributions(investment_id);

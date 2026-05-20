
-- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  household_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);

-- Trigger to create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, household_id)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- categories (per user)
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#7c3aed',
  icon text,
  kind text not null default 'expense' check (kind in ('expense','income')),
  created_at timestamptz not null default now()
);
alter table public.categories enable row level security;
create policy "categories_all_own" on public.categories for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- accounts (contas bancárias)
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  bank text,
  type text not null default 'checking' check (type in ('checking','savings','wallet','other')),
  initial_balance numeric(14,2) not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.accounts enable row level security;
create policy "accounts_all_own" on public.accounts for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- account_transactions
create table public.account_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  amount numeric(14,2) not null,
  kind text not null check (kind in ('income','expense','transfer')),
  description text,
  occurred_on date not null default current_date,
  created_at timestamptz not null default now()
);
alter table public.account_transactions enable row level security;
create policy "account_tx_all_own" on public.account_transactions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on public.account_transactions(user_id, occurred_on desc);
create index on public.account_transactions(account_id);

-- credit_cards
create table public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  brand text,
  credit_limit numeric(14,2) not null default 0,
  closing_day int not null check (closing_day between 1 and 31),
  due_day int not null check (due_day between 1 and 31),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.credit_cards enable row level security;
create policy "cards_all_own" on public.credit_cards for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- card_transactions (each installment is a separate row for simpler fatura calculation)
create table public.card_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.credit_cards(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  group_id uuid not null default gen_random_uuid(),
  amount numeric(14,2) not null,
  description text,
  purchased_on date not null default current_date,
  installment_no int not null default 1,
  installment_total int not null default 1,
  invoice_month date not null,
  created_at timestamptz not null default now()
);
alter table public.card_transactions enable row level security;
create policy "card_tx_all_own" on public.card_transactions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on public.card_transactions(user_id, invoice_month);
create index on public.card_transactions(card_id, invoice_month);

-- investments
create table public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_class text not null default 'stock' check (asset_class in ('stock','fii','etf','crypto','fixed_income','fund','other')),
  ticker text,
  name text not null,
  quantity numeric(18,8) not null default 0,
  average_price numeric(18,8) not null default 0,
  current_price numeric(18,8) not null default 0,
  notes text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.investments enable row level security;
create policy "inv_all_own" on public.investments for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);


ALTER TABLE public.investment_contributions
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'aporte',
  ADD COLUMN IF NOT EXISTS quantity numeric,
  ADD COLUMN IF NOT EXISTS unit_price numeric;


ALTER TABLE public.card_transactions
  ADD COLUMN IF NOT EXISTS payer_name TEXT;

ALTER TABLE public.investments
  ADD COLUMN IF NOT EXISTS funding_account_id UUID;

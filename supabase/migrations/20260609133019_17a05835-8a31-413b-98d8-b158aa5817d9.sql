ALTER TABLE public.investments
ADD COLUMN IF NOT EXISTS goal_value numeric,
ADD COLUMN IF NOT EXISTS goal_date date;
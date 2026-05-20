ALTER TABLE public.investments DROP CONSTRAINT IF EXISTS investments_asset_class_check;
ALTER TABLE public.investments ADD CONSTRAINT investments_asset_class_check
CHECK (asset_class = ANY (ARRAY['stock','fii','etf','crypto','fixed_income','caixinha','fund','previdencia','other']));
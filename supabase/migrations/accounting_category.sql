-- Safe additive change: adds nullable category column to extra_movements.
-- Does NOT modify any existing data or constraints.
ALTER TABLE public.extra_movements
  ADD COLUMN IF NOT EXISTS category text DEFAULT NULL;

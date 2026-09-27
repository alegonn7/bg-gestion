-- =====================================================
-- MIGRACIÓN: Fecha de vencimiento de productos (opcional)
-- Correr en Supabase SQL Editor
-- =====================================================

ALTER TABLE public.products_branch
  ADD COLUMN IF NOT EXISTS expiration_date date;

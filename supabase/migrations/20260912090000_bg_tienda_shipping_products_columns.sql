-- =====================================================
-- MIGRACIÓN: bg-tienda — peso y dimensiones de producto (para cotizar envío)
-- Correr en Supabase SQL Editor
--
-- Aditivo: bg-gestion (Electron/POS) ignora estas columnas por completo, igual que ya ignora
-- images/sizes/featured/show_online (20260818090000_bg_tienda_products_columns.sql).
-- =====================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS weight_grams numeric,  -- gramos, no kg -- evita floats de 0.001 en productos livianos
  ADD COLUMN IF NOT EXISTS length_cm    numeric,
  ADD COLUMN IF NOT EXISTS width_cm     numeric,
  ADD COLUMN IF NOT EXISTS height_cm    numeric;

ALTER TABLE products ADD CONSTRAINT products_weight_grams_non_negative CHECK (weight_grams IS NULL OR weight_grams >= 0);
ALTER TABLE products ADD CONSTRAINT products_length_cm_non_negative CHECK (length_cm IS NULL OR length_cm >= 0);
ALTER TABLE products ADD CONSTRAINT products_width_cm_non_negative CHECK (width_cm IS NULL OR width_cm >= 0);
ALTER TABLE products ADD CONSTRAINT products_height_cm_non_negative CHECK (height_cm IS NULL OR height_cm >= 0);

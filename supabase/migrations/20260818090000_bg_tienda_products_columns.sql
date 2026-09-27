-- =====================================================
-- MIGRACIÓN: bg-tienda — columnas de catálogo online en products
-- Correr en Supabase SQL Editor
-- Aditivo: bg-gestion (Electron/POS) ignora estas columnas por completo.
-- =====================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS images       text[] DEFAULT '{}',   -- URLs en el bucket store-product-images, uso exclusivo de bg-tienda
  ADD COLUMN IF NOT EXISTS sizes        text[] DEFAULT '{}',   -- etiquetas libres (no variantes con stock propio)
  ADD COLUMN IF NOT EXISTS featured     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_online  boolean DEFAULT true;  -- permite ocultar un producto del catálogo interno sin tocar is_active

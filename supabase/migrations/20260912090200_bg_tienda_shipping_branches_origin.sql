-- =====================================================
-- MIGRACIÓN: bg-tienda — dirección de origen para cotizar envío (branches)
-- Correr en Supabase SQL Editor
--
-- Complementa el "address" libre existente de branches (dirección de contacto, para que la lea
-- una persona) -- no lo reemplaza. Las APIs de cotización necesitan campos estructurados,
-- especialmente el código postal. No va en store_settings por el mismo motivo que las
-- credenciales (lectura pública sin filtro de columnas, 20260819180000).
--
-- Aditivo sobre branches: CreateBranchModal/EditBranchModal (Electron) siguen funcionando sin
-- cambios, simplemente no conocen estas columnas nuevas.
-- =====================================================

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS shipping_origin_street          text,
  ADD COLUMN IF NOT EXISTS shipping_origin_number          text,
  ADD COLUMN IF NOT EXISTS shipping_origin_floor_apartment text,
  ADD COLUMN IF NOT EXISTS shipping_origin_city            text,
  ADD COLUMN IF NOT EXISTS shipping_origin_province        text,
  ADD COLUMN IF NOT EXISTS shipping_origin_postal_code     text;

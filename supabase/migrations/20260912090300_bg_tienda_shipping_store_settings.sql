-- =====================================================
-- MIGRACIÓN: bg-tienda — configuración de envío por tienda
-- Correr en Supabase SQL Editor
--
-- Seguro en store_settings a pesar de su lectura pública: nada de esto es secreto, mismo
-- criterio que mp_fee_percentage/payment_online_enabled (el comprador ve el transportista y el
-- costo igual en el propio checkout).
--
-- No hay un toggle para "retiro en local": nunca se apaga, es siempre una opción gratuita en el
-- checkout, hardcodeada del lado de la UI -- no depende de esta configuración.
-- =====================================================

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS shipping_enabled              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shipping_carrier              text CHECK (shipping_carrier IN ('correo_argentino', 'andreani')),
  ADD COLUMN IF NOT EXISTS shipping_default_weight_grams numeric,
  ADD COLUMN IF NOT EXISTS shipping_default_length_cm    numeric,
  ADD COLUMN IF NOT EXISTS shipping_default_width_cm     numeric,
  ADD COLUMN IF NOT EXISTS shipping_default_height_cm    numeric;

ALTER TABLE store_settings ADD CONSTRAINT store_settings_shipping_requires_carrier
  CHECK (NOT shipping_enabled OR shipping_carrier IS NOT NULL);

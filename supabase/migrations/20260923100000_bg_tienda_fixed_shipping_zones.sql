-- =====================================================
-- MIGRACIÓN: bg-tienda — envío con montos fijos por zona (alternativa al envío automático)
-- Correr en Supabase SQL Editor
--
-- Pensado para tiendas que no quieren lidiar con credenciales de Correo Argentino/Andreani: un
-- costo fijo por defecto, con overrides opcionales por provincia (ej. "Buenos Aires: $X, resto
-- del país: $Y"). shipping_pricing_mode decide qué rama usa shipping-quote. shipping_carrier
-- (Correo Argentino/Andreani) sigue significando solo eso, nunca se reutiliza para este modo --
-- por eso se relaja el CHECK de habilitación en vez de tocar esa columna.
-- =====================================================

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS shipping_pricing_mode text NOT NULL DEFAULT 'carrier'
    CHECK (shipping_pricing_mode IN ('carrier', 'fixed_zones')),
  ADD COLUMN IF NOT EXISTS fixed_shipping_default_cost numeric CHECK (fixed_shipping_default_cost >= 0),
  ADD COLUMN IF NOT EXISTS fixed_shipping_zones jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE store_settings DROP CONSTRAINT IF EXISTS store_settings_shipping_requires_carrier;
ALTER TABLE store_settings ADD CONSTRAINT store_settings_shipping_requires_carrier
  CHECK (
    NOT shipping_enabled
    OR (shipping_pricing_mode = 'carrier' AND shipping_carrier IS NOT NULL)
    OR (shipping_pricing_mode = 'fixed_zones' AND fixed_shipping_default_cost IS NOT NULL)
  );

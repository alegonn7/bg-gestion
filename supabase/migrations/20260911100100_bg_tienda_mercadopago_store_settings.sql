-- =====================================================
-- MIGRACIÓN: bg-tienda — comisión de Mercado Pago configurable por tienda
-- Correr en Supabase SQL Editor
-- =====================================================

-- NULL = usa el default de plataforma (MP_PLATFORM_FEE_PERCENTAGE, secret de Edge Function).
-- No es un secreto -- el comprador lo ve igual desglosado en el propio checkout de Mercado
-- Pago -- por eso puede vivir en store_settings (con su policy de lectura pública) y editarse
-- con un Server Action simple, sin pasar por una Edge Function solo para cambiar un número.
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS mp_fee_percentage numeric(5,2);

ALTER TABLE store_settings ADD CONSTRAINT store_settings_mp_fee_range
  CHECK (mp_fee_percentage IS NULL OR (mp_fee_percentage >= 0 AND mp_fee_percentage <= 100));

-- No tiene sentido cobrar un monto fijo online mientras la tienda muestra "a confirmar"
-- públicamente (show_prices = false) -- se refuerza a nivel DB, no solo de UI. Seguro de aplicar
-- sobre datos existentes: payment_online_enabled todavía no se usó en ninguna tienda real (Fase
-- 08), así que hoy vale false en todas las filas.
ALTER TABLE store_settings ADD CONSTRAINT store_settings_payment_requires_prices
  CHECK (NOT payment_online_enabled OR show_prices);

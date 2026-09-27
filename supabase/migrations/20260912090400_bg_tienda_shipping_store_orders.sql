-- =====================================================
-- MIGRACIÓN: bg-tienda — destino, costo y método de entrega en pedidos online
-- Correr en Supabase SQL Editor
--
-- Reutiliza customer_name/customer_phone/customer_note (ya existen desde la Fase 01, hoy nunca
-- se completan porque ni createPendingOrder ni createMercadoPagoCheckout los setean) en vez de
-- crear columnas nuevas -- el nuevo paso de checkout con envío los empieza a poblar de verdad.
--
-- Seguro agregar dirección del cliente acá: store_orders NO tiene policy pública de SELECT
-- (solo store_orders_org para staff autenticado y store_orders_public_insert de solo INSERT
-- para anon) -- a diferencia de store_settings, esto no queda expuesto.
-- =====================================================

ALTER TABLE store_orders
  ADD COLUMN IF NOT EXISTS delivery_method          text NOT NULL DEFAULT 'pickup' CHECK (delivery_method IN ('pickup', 'shipping')),
  ADD COLUMN IF NOT EXISTS shipping_carrier         text CHECK (shipping_carrier IN ('correo_argentino', 'andreani')),
  ADD COLUMN IF NOT EXISTS shipping_cost            numeric,
  ADD COLUMN IF NOT EXISTS shipping_quote_reference text,
  ADD COLUMN IF NOT EXISTS shipping_street          text,
  ADD COLUMN IF NOT EXISTS shipping_number          text,
  ADD COLUMN IF NOT EXISTS shipping_floor_apartment text,
  ADD COLUMN IF NOT EXISTS shipping_city            text,
  ADD COLUMN IF NOT EXISTS shipping_province        text,
  ADD COLUMN IF NOT EXISTS shipping_postal_code     text;

ALTER TABLE store_orders ADD CONSTRAINT store_orders_shipping_requires_address
  CHECK (delivery_method = 'pickup' OR shipping_postal_code IS NOT NULL);

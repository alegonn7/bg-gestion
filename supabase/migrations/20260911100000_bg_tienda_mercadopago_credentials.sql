-- =====================================================
-- MIGRACIÓN: bg-tienda — credenciales OAuth de Mercado Pago por tienda
-- Correr en Supabase SQL Editor
--
-- Tabla separada de store_settings a propósito: store_settings tiene una policy de lectura
-- pública sin restricción de columnas (20260819180000_bg_tienda_store_settings_public_read,
-- "enabled = true"), así que cualquier columna agregada ahí es legible por "anon" vía REST para
-- toda tienda habilitada. Los tokens de Mercado Pago no pueden vivir ahí bajo ninguna forma, ni
-- cifrados (filtrar el ciphertext ya es mala práctica). Esta tabla no tiene ninguna policy para
-- anon/authenticated: todo acceso pasa por la Edge Function mercadopago-setup con la
-- service_role key.
-- =====================================================

CREATE TABLE IF NOT EXISTS store_mercadopago_credentials (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  mp_user_id              text NOT NULL,   -- id de usuario de MP del vendedor, no es secreto
  mp_email                text,            -- solo para mostrar "Conectado como: x@mail.com" en la UI
  access_token_encrypted  text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  token_expires_at        timestamptz NOT NULL,
  live_mode               boolean NOT NULL DEFAULT true,   -- false si conectaron con una cuenta de test de MP
  connected_by            uuid REFERENCES users(id),
  connected_at            timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE store_mercadopago_credentials ENABLE ROW LEVEL SECURITY;

-- Sin policies para anon/authenticated a propósito (ver comentario arriba), más un REVOKE
-- explícito como defensa en profundidad contra grants ambientales que Supabase pueda aplicar
-- sobre "public" por default. La Edge Function usa la service_role key, que no depende de estos
-- grants de rol.
REVOKE ALL ON store_mercadopago_credentials FROM anon, authenticated;
GRANT ALL ON store_mercadopago_credentials TO service_role;

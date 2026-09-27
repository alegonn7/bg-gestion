-- =====================================================
-- MIGRACIÓN: bg-tienda — credenciales de transportista de envío por tienda
-- Correr en Supabase SQL Editor
--
-- Mismo espíritu que store_mercadopago_credentials (20260911100000): store_settings tiene
-- lectura pública sin restricción de columnas (20260819180000), así que ninguna credencial
-- puede vivir ahí. Esta tabla no tiene ninguna policy para anon/authenticated -- todo acceso
-- pasa por la Edge Function shipping-setup con la service_role key.
--
-- UNIQUE(organization_id, carrier) en vez de 1:1 estricto: si una tienda prueba un
-- transportista y vuelve al otro, no pierde las credenciales ya cargadas -- solo cambia cuál
-- está activo (store_settings.shipping_carrier).
--
-- credentials_encrypted es un blob JSON cifrado, no columnas fijas: el modelo de credenciales
-- es distinto entre los dos transportistas soportados (Correo Argentino: un token único;
-- Andreani: usuario + contraseña + código de cliente). Forzar ambos a las mismas columnas fijas
-- sería peor que un blob genérico.
-- =====================================================

CREATE TABLE IF NOT EXISTS store_shipping_credentials (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  carrier               text NOT NULL CHECK (carrier IN ('correo_argentino', 'andreani')),
  credentials_encrypted text NOT NULL,
  environment           text NOT NULL DEFAULT 'production' CHECK (environment IN ('test', 'production')),
  display_label         text,
  connected_by          uuid REFERENCES users(id),
  connected_at          timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, carrier)
);

ALTER TABLE store_shipping_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON store_shipping_credentials FROM anon, authenticated;
GRANT ALL ON store_shipping_credentials TO service_role;

-- =====================================================
-- MIGRACIÓN: bg-tienda — habilitar/deshabilitar pedidos por WhatsApp
--
-- Mismo criterio que payment_online_enabled para Mercado Pago: la tienda puede apagar el canal
-- de WhatsApp sin perder nada más (número, plantilla de mensaje, etc. quedan intactos).
-- Default true: las tiendas existentes no pierden esto de golpe al correr la migración.
--
-- La columna nueva va al FINAL del SELECT de la vista a propósito: CREATE OR REPLACE VIEW no
-- permite reordenar ni insertar columnas en el medio de una vista ya existente (solo agregar al
-- final), o Postgres lo interpreta como un rename y falla.
-- =====================================================

ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS whatsapp_orders_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE VIEW store_directory AS
SELECT
  o.id AS organization_id,
  o.name AS organization_name,
  o.slug,
  s.branch_id,
  s.store_name,
  o.logo_url,
  s.favicon_url,
  s.accent_color,
  s.whatsapp_number,
  s.whatsapp_message_template,
  s.instagram_url,
  s.facebook_url,
  s.show_prices,
  s.payment_online_enabled,
  s.hero_title,
  s.hero_subtitle,
  s.features,
  s.logo_height,
  s.header_display,
  s.payment_online_enabled AND (EXISTS (
    SELECT 1 FROM store_mercadopago_credentials c WHERE c.organization_id = o.id
  )) AS mercadopago_available,
  s.shipping_enabled,
  s.shipping_carrier,
  s.whatsapp_orders_enabled
FROM organizations o
JOIN store_settings s ON s.organization_id = o.id
WHERE s.enabled = true;

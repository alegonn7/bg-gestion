-- BG Tienda: la tienda pública muestra la barra de "envío gratis" y los datos de retiro.
-- Agrega al final de store_directory (sin tocar las columnas existentes):
--   free_shipping_threshold  el mismo monto que ya aplica la función shipping-quote.
--   pickup_address           store_settings.extra->>'pickup_address' o, si está vacío, la
--                            dirección de la sucursal de la tienda online.
--   pickup_hours             store_settings.extra->>'pickup_hours' (texto libre, opcional).
CREATE OR REPLACE VIEW store_directory AS
SELECT
  o.id   AS organization_id,
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
  (s.payment_online_enabled AND EXISTS (
    SELECT 1 FROM store_mercadopago_credentials c WHERE c.organization_id = o.id
  )) AS mercadopago_available,
  s.shipping_enabled,
  s.shipping_carrier,
  s.whatsapp_orders_enabled,
  s.transfer_enabled,
  s.transfer_cbu,
  s.transfer_alias,
  s.transfer_receipt_email,
  s.free_shipping_threshold,
  coalesce(nullif(btrim(s.extra->>'pickup_address'), ''), nullif(btrim(b.address), '')) AS pickup_address,
  nullif(btrim(s.extra->>'pickup_hours'), '') AS pickup_hours
FROM organizations o
JOIN store_settings s ON s.organization_id = o.id
LEFT JOIN branches b ON b.id = s.branch_id
WHERE s.enabled = true
  AND coalesce(o.subscription_status, 'active') NOT IN ('pending', 'suspended');

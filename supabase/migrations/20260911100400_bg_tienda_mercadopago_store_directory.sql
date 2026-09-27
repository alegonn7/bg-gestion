-- =====================================================
-- MIGRACIÓN: bg-tienda — exponer disponibilidad de Mercado Pago en store_directory
-- Correr en Supabase SQL Editor
--
-- El storefront público necesita saber si mostrar el botón "Pagar con Mercado Pago" sin poder
-- leer store_mercadopago_credentials directamente (no tiene policies para anon, ver
-- 20260911100000). Se expone solo un booleano combinado -- no filtra nada del contenido de las
-- credenciales, solo su existencia. La vista corre con los permisos de su dueño (igual mecanismo
-- que ya usa para el resto de las columnas), así que puede leer esa tabla pese a que no tiene
-- ninguna policy pública.
--
-- CREATE OR REPLACE VIEW no permite quitar ni reordenar columnas existentes, solo agregar al
-- final -- por eso esta es una copia exacta de la definición vigente (20260819170000_bg_tienda_
-- header_display_mode.sql) más la columna nueva al final.
-- =====================================================

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
    s.payment_online_enabled AND EXISTS (
      SELECT 1 FROM store_mercadopago_credentials c WHERE c.organization_id = o.id
    ) AS mercadopago_available
  FROM organizations o
  JOIN store_settings s ON s.organization_id = o.id
  WHERE s.enabled = true;

GRANT SELECT ON store_directory TO anon, authenticated;

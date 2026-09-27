-- =====================================================
-- MIGRACIÓN: bg-tienda — título y subtítulo del hero, personalizables por tienda
-- Correr en Supabase SQL Editor
-- Hasta ahora "Tus pins, a tu manera." y el texto de pins/llaveros estaban hardcodeados en
-- app/[slug]/page.tsx (herencia de Pins-crew) — cualquier tienda nueva que no venda pins los
-- heredaba sin sentido. Quedan en store_settings, editables por el dueño de la tienda.
-- =====================================================

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS hero_title    text,
  ADD COLUMN IF NOT EXISTS hero_subtitle text;

-- store_directory (Fase 01) es una proyección curada de columnas, no select * — hay que
-- agregar las dos nuevas ahí también o getStoreBySlug() nunca las va a ver.
CREATE OR REPLACE VIEW store_directory AS
  SELECT
    o.id AS organization_id,
    o.name AS organization_name,
    o.slug,
    s.branch_id,
    s.store_name,
    s.logo_url,
    s.favicon_url,
    s.accent_color,
    s.whatsapp_number,
    s.whatsapp_message_template,
    s.instagram_url,
    s.facebook_url,
    s.show_prices,
    s.payment_online_enabled,
    s.hero_title,
    s.hero_subtitle
  FROM organizations o
  JOIN store_settings s ON s.organization_id = o.id
  WHERE s.enabled = true;

GRANT SELECT ON store_directory TO anon, authenticated;

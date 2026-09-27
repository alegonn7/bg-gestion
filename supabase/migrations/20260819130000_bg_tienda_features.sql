-- =====================================================
-- MIGRACIÓN: bg-tienda — franja de "features" del home, personalizable por tienda
-- Correr en Supabase SQL Editor
-- Igual que hero_title/hero_subtitle: "Producción local / Fabricación argentina" hardcodeado
-- no tiene sentido para una tienda que no fabrica nada localmente. jsonb, mismo idioma que
-- plan_config.features — array de {title, text}, sin ítems fijos ni límite artificial.
-- =====================================================

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS features jsonb DEFAULT '[]'::jsonb;

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
    s.hero_subtitle,
    s.features
  FROM organizations o
  JOIN store_settings s ON s.organization_id = o.id
  WHERE s.enabled = true;

GRANT SELECT ON store_directory TO anon, authenticated;

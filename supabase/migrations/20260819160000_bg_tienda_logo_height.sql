-- Alto del logo en el navbar, elegible por cada tienda desde /admin/configuracion (en px, el
-- navbar tiene 64px de alto total así que se limita el rango en la UI, no acá).
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS logo_height integer NOT NULL DEFAULT 32;

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
    s.logo_height
  FROM organizations o
  JOIN store_settings s ON s.organization_id = o.id
  WHERE s.enabled = true;

GRANT SELECT ON store_directory TO anon, authenticated;

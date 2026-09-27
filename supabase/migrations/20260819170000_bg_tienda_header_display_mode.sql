-- Como se muestra la marca en el navbar: solo logo, solo nombre, o los dos juntos. Si el modo
-- es 'logo' pero la tienda no cargo ninguno, el navbar cae a mostrar el nombre igual (ver
-- components/navbar.tsx) para que el header nunca quede vacio.
ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS header_display text NOT NULL DEFAULT 'logo'
  CHECK (header_display IN ('logo', 'name', 'both'));

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
    s.header_display
  FROM organizations o
  JOIN store_settings s ON s.organization_id = o.id
  WHERE s.enabled = true;

GRANT SELECT ON store_directory TO anon, authenticated;

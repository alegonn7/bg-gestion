-- El logo de la tienda pasa a ser el mismo que usa bg-gestion (organizations.logo_url) en vez de
-- un campo separado en store_settings que nunca tuvo UI para cargarse. Un solo logo por
-- organización, compartido entre bg-gestion y bg-tienda.
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
    s.features
  FROM organizations o
  JOIN store_settings s ON s.organization_id = o.id
  WHERE s.enabled = true;

GRANT SELECT ON store_directory TO anon, authenticated;

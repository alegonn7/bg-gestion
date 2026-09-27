-- =====================================================
-- MIGRACIÓN: bg-tienda — catálogo público (storefront anónimo)
-- Correr en Supabase SQL Editor
--
-- El storefront lo visitan clientes sin sesión. En vez de agregar policies públicas directas
-- sobre "organizations" o "products_branch" (que expondrían columnas sensibles como cuit,
-- subscription_status o price_cost a cualquiera que pegue contra la REST API), se usan vistas
-- que exponen solo lo necesario. Las vistas corren con los permisos de quien las creó, así que
-- no hace falta ni conviene tocar el RLS de las tablas base para esto.
-- =====================================================

-- Resuelve slug -> datos públicos de la tienda (sin cuit, razon_social, subscription_status, metadata...).
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
    s.payment_online_enabled
  FROM organizations o
  JOIN store_settings s ON s.organization_id = o.id
  WHERE s.enabled = true;

GRANT SELECT ON store_directory TO anon, authenticated;

-- Catálogo público: solo la sucursal marcada como "online" de cada tienda, solo precio de venta
-- (nunca price_cost/price_cost_usd), solo productos activos y con show_online = true.
CREATE OR REPLACE VIEW store_catalog AS
  SELECT
    p.id AS product_id,
    p.organization_id,
    p.name,
    p.description,
    p.images,
    p.sizes,
    p.featured,
    c.name AS category_name,
    c.color AS category_color,
    c.icon AS category_icon,
    pb.id AS product_branch_id,
    pb.branch_id,
    pb.price_sale,
    pb.price_sale_usd,
    pb.stock_quantity,
    pb.alicuota_iva
  FROM products p
  JOIN products_branch pb ON pb.product_id = p.id
  LEFT JOIN categories c ON c.id = p.category_id
  JOIN store_settings s ON s.organization_id = p.organization_id AND s.branch_id = pb.branch_id
  WHERE s.enabled = true
    AND p.is_active = true
    AND p.show_online = true
    AND pb.is_active = true;

GRANT SELECT ON store_catalog TO anon, authenticated;

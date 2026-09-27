-- =====================================================
-- MIGRACIÓN: bg-tienda — agrega created_at a store_catalog
-- Correr en Supabase SQL Editor
-- Necesario para poder ordenar "más nuevos primero" en el listado público (Fase 04, ecomerse).
-- =====================================================

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
    pb.alicuota_iva,
    p.created_at
  FROM products p
  JOIN products_branch pb ON pb.product_id = p.id
  LEFT JOIN categories c ON c.id = p.category_id
  JOIN store_settings s ON s.organization_id = p.organization_id AND s.branch_id = pb.branch_id
  WHERE s.enabled = true
    AND p.is_active = true
    AND p.show_online = true
    AND pb.is_active = true;

GRANT SELECT ON store_catalog TO anon, authenticated;

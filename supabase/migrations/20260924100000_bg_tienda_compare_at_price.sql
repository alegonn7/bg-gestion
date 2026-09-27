-- =====================================================
-- MIGRACIÓN: bg-tienda — precio de oferta (tachado) por producto
--
-- Hallazgo de la auditoría: para hacer una promo había que cambiar el precio real del
-- producto, sin ningún rastro de "antes costaba más". compare_at_price es opcional: si está
-- cargado y es mayor a price_sale, la tienda muestra el precio anterior tachado.
-- =====================================================

ALTER TABLE products_branch ADD COLUMN IF NOT EXISTS compare_at_price numeric;

-- store_catalog: agregar compare_at_price AL FINAL del SELECT (CREATE OR REPLACE VIEW no deja
-- reordenar columnas existentes).
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
    p.created_at,
    pb.compare_at_price
  FROM products p
  JOIN products_branch pb ON pb.product_id = p.id
  LEFT JOIN categories c ON c.id = p.category_id
  JOIN store_settings s ON s.organization_id = p.organization_id AND s.branch_id = pb.branch_id
  WHERE s.enabled = true
    AND p.is_active = true
    AND p.show_online = true
    AND pb.is_active = true
    AND pb.stock_quantity > 0;

GRANT SELECT ON store_catalog TO anon, authenticated;

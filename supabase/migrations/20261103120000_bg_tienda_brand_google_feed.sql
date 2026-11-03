-- ============================================================================
-- MIGRACIÓN: bg-tienda — marca del producto y código de barras en el catálogo público
-- ============================================================================
-- Para el feed de Google Merchant Center (/[slug]/feed.xml) y el JSON-LD de Product, Google pide
-- la marca real del producto (JBL, Xiaomi...) y el GTIN/EAN.
--
-- 1. products.brand: columna nueva, opcional (NULL por defecto). BG Gestión no la lee ni la escribe;
--    la edita el admin de bg-tienda. Tope de 70 caracteres, el máximo que acepta Google.
-- 2. store_catalog: se agregan brand y barcode AL FINAL (CREATE OR REPLACE VIEW no deja cambiar el
--    orden de columnas existentes). El código de barras ya existía (products.barcode, lo usa el POS
--    de BG Gestión); es el mismo número impreso en el envase, así que no es un dato sensible.
-- No se borra ni se cambia nada existente.
-- ============================================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS brand text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_brand_length') THEN
    ALTER TABLE products ADD CONSTRAINT products_brand_length CHECK (brand IS NULL OR char_length(brand) <= 70);
  END IF;
END $$;

CREATE OR REPLACE VIEW store_catalog AS
SELECT
  p.id AS product_id,
  p.organization_id,
  p.name,
  p.description,
  p.images,
  p.sizes,
  p.featured,
  c.name  AS category_name,
  c.color AS category_color,
  c.icon  AS category_icon,
  pb.id AS product_branch_id,
  pb.branch_id,
  pb.price_sale,
  pb.price_sale_usd,
  pb.stock_quantity,
  pb.alicuota_iva,
  p.created_at,
  pb.compare_at_price,
  p.brand,
  p.barcode
FROM products p
JOIN products_branch pb ON pb.product_id = p.id
LEFT JOIN categories c ON c.id = p.category_id
JOIN store_settings s ON s.organization_id = p.organization_id AND s.branch_id = pb.branch_id
WHERE s.enabled = true
  AND p.is_active = true
  AND p.show_online = true
  AND pb.is_active = true
  AND pb.stock_quantity > 0
  AND EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.id = p.organization_id
      AND coalesce(o.subscription_status, 'active') NOT IN ('pending', 'suspended')
  );

GRANT SELECT ON store_catalog TO anon, authenticated;

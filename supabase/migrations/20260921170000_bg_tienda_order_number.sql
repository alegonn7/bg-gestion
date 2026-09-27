-- =====================================================
-- MIGRACIÓN: bg-tienda — número de pedido secuencial, legible para humanos
-- Correr en Supabase SQL Editor
--
-- store_orders.id es un uuid (a propósito -- es lo que hace de "token" no-adivinable para el
-- acceso público en get_public_store_order). Pero para mostrarle un pedido a un cliente por
-- email o para que el dueño lo mencione en el admin ("tu pedido #42"), hace falta un número
-- corto. Secuencia global (no por organización): más simple, y en la práctica no importa que
-- los números no arranquen en 1 para cada tienda nueva.
-- =====================================================

CREATE SEQUENCE IF NOT EXISTS store_orders_order_number_seq;

ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS order_number bigint;

-- Backfill de los pedidos que ya existen, en orden cronológico.
WITH numbered AS (
  SELECT id, row_number() OVER (ORDER BY created_at) AS rn
  FROM store_orders
  WHERE order_number IS NULL
)
UPDATE store_orders o SET order_number = numbered.rn
FROM numbered
WHERE o.id = numbered.id;

SELECT setval('store_orders_order_number_seq', COALESCE((SELECT MAX(order_number) FROM store_orders), 0) + 1, false);

ALTER TABLE store_orders ALTER COLUMN order_number SET DEFAULT nextval('store_orders_order_number_seq');
ALTER TABLE store_orders ALTER COLUMN order_number SET NOT NULL;
ALTER TABLE store_orders ADD CONSTRAINT store_orders_order_number_key UNIQUE (order_number);
ALTER SEQUENCE store_orders_order_number_seq OWNED BY store_orders.order_number;

-- get_public_store_order (migración 20260918120000) ahora también expone el número de pedido.
CREATE OR REPLACE FUNCTION get_public_store_order(
  p_store_order_id uuid
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'organization_id', o.organization_id,
    'status', o.status,
    'mp_status', o.mp_status,
    'subtotal', o.subtotal,
    'total', o.total,
    'delivery_method', o.delivery_method,
    'shipping_street', o.shipping_street,
    'shipping_number', o.shipping_number,
    'shipping_floor_apartment', o.shipping_floor_apartment,
    'shipping_city', o.shipping_city,
    'shipping_province', o.shipping_province,
    'shipping_postal_code', o.shipping_postal_code,
    'shipping_cost', o.shipping_cost,
    'created_at', o.created_at,
    'confirmed_at', o.confirmed_at,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'product_name', i.product_name,
        'size', i.size,
        'quantity', i.quantity,
        'unit_price', i.unit_price,
        'subtotal', i.subtotal
      ) ORDER BY i.id)
      FROM store_order_items i
      WHERE i.store_order_id = o.id
    ), '[]'::jsonb)
  )
  FROM store_orders o
  WHERE o.id = p_store_order_id;
$$;

GRANT EXECUTE ON FUNCTION get_public_store_order(uuid) TO anon, authenticated;

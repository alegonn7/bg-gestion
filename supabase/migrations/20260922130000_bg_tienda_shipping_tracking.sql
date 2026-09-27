-- =====================================================
-- MIGRACIÓN: bg-tienda — código de seguimiento de envío + envío gratis a partir de un monto
-- Correr en Supabase SQL Editor
--
-- Parte 1: sub-estado de "confirmed" para pedidos con delivery_method='shipping': pagado pero
-- todavía sin despachar (tracking_code NULL) vs ya despachado (tracking_code cargado). No se
-- toca la columna status ni ningún CHECK/RPC existente -- esto es pura data adicional, derivada
-- en la UI.
--
-- Parte 2: la tienda puede configurar un monto de subtotal a partir del cual el envío es
-- gratis (free_shipping_threshold NULL = nunca gratis, la tienda no absorbe nada). Cuando
-- aplica, shipping-quote devuelve cost=0 pero informa el costo real en shipping_original_cost,
-- que createMercadoPagoCheckout guarda tal cual -- así el detalle del pedido (pantalla, admin,
-- emails) siempre puede mostrar "envío gratis, normalmente $X" en vez de ocultar la línea.
-- =====================================================

ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS tracking_code text;
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS shipped_at timestamptz;
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS shipping_original_cost numeric;

ALTER TABLE store_settings ADD COLUMN IF NOT EXISTS free_shipping_threshold numeric CHECK (free_shipping_threshold >= 0);

-- get_public_store_order (20260918120000, con order_number desde 20260921170000) ahora también
-- expone el código de seguimiento, para que el cliente lo vea en /[slug]/pedido/[orderId].
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
    'shipping_carrier', o.shipping_carrier,
    'shipping_street', o.shipping_street,
    'shipping_number', o.shipping_number,
    'shipping_floor_apartment', o.shipping_floor_apartment,
    'shipping_city', o.shipping_city,
    'shipping_province', o.shipping_province,
    'shipping_postal_code', o.shipping_postal_code,
    'shipping_cost', o.shipping_cost,
    'shipping_original_cost', o.shipping_original_cost,
    'tracking_code', o.tracking_code,
    'shipped_at', o.shipped_at,
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

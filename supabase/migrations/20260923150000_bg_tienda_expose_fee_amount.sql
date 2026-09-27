-- =====================================================
-- MIGRACIÓN: bg-tienda — exponer la comisión en get_public_store_order
--
-- La comisión volvió a sumarse al total que paga el cliente (mercadopago-checkout) -- hace
-- falta mostrarla como línea propia en la pantalla de pedido, no solo en el email/admin.
-- =====================================================

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
    'mp_fee_amount', o.mp_fee_amount,
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

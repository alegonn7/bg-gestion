-- =====================================================
-- MIGRACIÓN: bg-tienda — email del cliente + lookup público de un pedido
-- Correr en Supabase SQL Editor
--
-- Necesario para la pantalla de confirmación (/[slug]/pedido/[orderId]) y para poder mandarle
-- el detalle de la compra por mail al cliente. store_orders hoy solo tiene policies de
-- INSERT público y de SELECT/ALL para staff de la organización (auth.uid()) -- no hay forma de
-- abrir un SELECT público filtrado por id vía RLS sin exponer TODOS los pedidos de TODAS las
-- tiendas a cualquiera que pegue contra la API REST directo (RLS no puede saber "este id vino
-- del link que le dimos al cliente"). Por eso el acceso público es vía esta función
-- SECURITY DEFINER, que solo devuelve un pedido puntual por id (posesión del UUID = autorización,
-- mismo modelo de confianza que ya usa mercadopago-checkout con su adminSupabase) y solo expone
-- las columnas necesarias para la pantalla, sin datos de contacto del cliente.
-- =====================================================

ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS customer_email text;

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

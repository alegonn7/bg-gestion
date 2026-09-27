-- =====================================================
-- MIGRACIÓN: bg-tienda — pago por transferencia bancaria
--
-- Tercer método de pago (junto a WhatsApp y Mercado Pago), con su propio toggle. El cliente ve
-- CBU/alias, transfiere por fuera del sistema y manda el comprobante al email que la tienda
-- configuró -- nosotros no procesamos nada de la transferencia en sí, solo mostramos los datos
-- y dejamos el pedido "pending" hasta que el dueño confirma a mano desde /admin/pedidos.
--
-- CBU/alias/email de comprobante son datos para publicar a propósito (igual que un alias de
-- Mercado Pago, no dan acceso a sacar plata) -- seguros en store_directory igual que el resto
-- de esta vista.
-- =====================================================

ALTER TABLE store_orders DROP CONSTRAINT IF EXISTS store_orders_payment_method_check;
ALTER TABLE store_orders ADD CONSTRAINT store_orders_payment_method_check
  CHECK (payment_method = ANY (ARRAY['whatsapp'::text, 'mercadopago'::text, 'transfer'::text]));

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS transfer_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS transfer_cbu text,
  ADD COLUMN IF NOT EXISTS transfer_alias text,
  ADD COLUMN IF NOT EXISTS transfer_receipt_email text;

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
  s.header_display,
  s.payment_online_enabled AND (EXISTS (
    SELECT 1 FROM store_mercadopago_credentials c WHERE c.organization_id = o.id
  )) AS mercadopago_available,
  s.shipping_enabled,
  s.shipping_carrier,
  s.whatsapp_orders_enabled,
  s.transfer_enabled,
  s.transfer_cbu,
  s.transfer_alias,
  s.transfer_receipt_email
FROM organizations o
JOIN store_settings s ON s.organization_id = o.id
WHERE s.enabled = true;

-- get_public_store_order (migración 20260918120000 en adelante) no exponía payment_method --
-- hace falta para que la pantalla de pedido sepa si es transferencia y mostrar las
-- instrucciones mientras está pending.
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
    'payment_method', o.payment_method,
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

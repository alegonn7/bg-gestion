-- =====================================================
-- MIGRACIÓN: bg-tienda — fix real del insert anónimo de store_order_items
--
-- store_order_items_public_insert necesita verificar "¿este store_order_id es un pedido
-- pending de una tienda habilitada?" contra store_orders -- pero esa tabla no tiene ninguna
-- policy de SELECT pública (a propósito, tiene nombre/teléfono/dirección del cliente). Cuando
-- Postgres evalúa esa subquery como el rol anon, RLS de store_orders la filtra a 0 filas
-- siempre, así que el INSERT de store_order_items se rechazaba siempre para un cliente
-- anónimo real (nunca funcionó para un visitante de verdad, solo "andaba" en pruebas hechas
-- con sesión de staff ya logueada, que sí puede leer store_orders vía store_orders_org).
--
-- Fix: la verificación pasa a una función SECURITY DEFINER (mismo patrón que
-- get_public_store_order) -- corre con privilegios elevados así que SÍ puede leer
-- store_orders internamente, sin que eso implique abrir una policy de SELECT genérica para
-- anon en esa tabla. anon sigue sin poder leer store_orders directo; solo puede preguntarle a
-- esta función puntual "¿este id es insertable?".
-- =====================================================

CREATE OR REPLACE FUNCTION is_public_insertable_pending_order(p_store_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM store_orders
    WHERE id = p_store_order_id
      AND status = 'pending'
      AND organization_id IN (SELECT organization_id FROM store_settings WHERE enabled = true)
  );
$$;

GRANT EXECUTE ON FUNCTION is_public_insertable_pending_order(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "store_order_items_public_insert" ON store_order_items;
CREATE POLICY "store_order_items_public_insert" ON store_order_items
  FOR INSERT WITH CHECK (is_public_insertable_pending_order(store_order_id));

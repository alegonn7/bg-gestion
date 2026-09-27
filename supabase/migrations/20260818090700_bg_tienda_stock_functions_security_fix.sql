-- =====================================================
-- MIGRACIÓN: bg-tienda — fix de seguridad sobre las funciones de stock
-- Correr en Supabase SQL Editor
--
-- get_advisors detectó que Postgres otorga EXECUTE a PUBLIC (incluido "anon") sobre funciones
-- nuevas por default. Tal como quedaron creadas, cualquier visitante sin sesión podía llamar
-- /rest/v1/rpc/adjust_branch_stock directo y modificar el stock de cualquier producto de
-- cualquier organización, y confirm_store_order confiaba en un parámetro p_confirmed_by
-- provisto por quien llama en vez de derivarlo de la sesión real (auth.uid()) — alguien podía
-- pasar cualquier uuid de usuario sin haber iniciado sesión como ese usuario.
--
-- Fix: (1) confirm_store_order ya no recibe p_confirmed_by, lo deriva de auth.uid(); (2) se
-- revoca EXECUTE de "anon"/PUBLIC en ambas funciones; (3) adjust_branch_stock queda como helper
-- interno, sin ningún grant directo — solo la puede llamar otra función SECURITY DEFINER (como
-- confirm_store_order), nunca un cliente externo.
-- =====================================================

DROP FUNCTION IF EXISTS confirm_store_order(uuid, uuid);

CREATE OR REPLACE FUNCTION confirm_store_order(
  p_store_order_id uuid
) RETURNS sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order         store_orders;
  v_item          RECORD;
  v_pb            products_branch;
  v_sale          sales;
  v_confirmed_by  uuid;
  v_org_id        uuid;
BEGIN
  -- Identidad real del que llama, no un parámetro que cualquiera podría falsificar.
  SELECT id, organization_id INTO v_confirmed_by, v_org_id
  FROM users WHERE auth_id = auth.uid();

  IF v_confirmed_by IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_order FROM store_orders WHERE id = p_store_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_order_not_found';
  END IF;

  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'store_order_not_pending';
  END IF;

  IF v_org_id <> v_order.organization_id THEN
    RAISE EXCEPTION 'not_authorized_for_this_organization';
  END IF;

  INSERT INTO sales (branch_id, total, subtotal, payment_method, status, created_by)
  VALUES (
    v_order.branch_id, coalesce(v_order.total, 0), coalesce(v_order.subtotal, 0),
    'Online', 'completed', v_confirmed_by
  )
  RETURNING * INTO v_sale;

  FOR v_item IN
    SELECT * FROM store_order_items WHERE store_order_id = p_store_order_id
  LOOP
    SELECT pb.* INTO v_pb
    FROM products_branch pb
    WHERE pb.product_id = v_item.product_id
      AND pb.branch_id = v_order.branch_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'product_not_found_in_online_branch: %', v_item.product_name;
    END IF;

    PERFORM adjust_branch_stock(
      v_pb.id, -v_item.quantity, 'sale',
      format('Pedido online #%s', left(p_store_order_id::text, 8)),
      format('Tienda online — %s', coalesce(v_order.customer_name, 'cliente')),
      v_sale.id, v_confirmed_by
    );

    INSERT INTO sale_items (sale_id, product_branch_id, quantity, price, cost, subtotal)
    VALUES (
      v_sale.id, v_pb.id, v_item.quantity,
      coalesce(v_item.unit_price, v_pb.price_sale, 0),
      coalesce(v_pb.price_cost, 0),
      coalesce(v_item.subtotal, v_item.quantity * coalesce(v_item.unit_price, v_pb.price_sale, 0))
    );
  END LOOP;

  UPDATE store_orders
     SET status = 'confirmed', confirmed_by = v_confirmed_by, confirmed_at = now(), updated_at = now()
   WHERE id = p_store_order_id;

  RETURN v_sale;
END;
$$;

-- adjust_branch_stock: helper interno. Nadie externo debería llamarlo directo — solo lo usa
-- confirm_store_order (y futuras funciones equivalentes) desde adentro.
REVOKE EXECUTE ON FUNCTION adjust_branch_stock(uuid, int, text, text, text, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION adjust_branch_stock(uuid, int, text, text, text, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION adjust_branch_stock(uuid, int, text, text, text, uuid, uuid) FROM authenticated;

-- confirm_store_order: solo usuarios logueados (staff de una organización) pueden confirmar
-- pedidos. El chequeo de que el pedido sea de SU organización ya queda adentro de la función.
REVOKE EXECUTE ON FUNCTION confirm_store_order(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION confirm_store_order(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION confirm_store_order(uuid) TO authenticated;

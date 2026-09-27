-- =====================================================
-- MIGRACIÓN: bg-tienda — confirmación y reembolso de pedidos pagados con Mercado Pago
-- Correr en Supabase SQL Editor
--
-- confirm_store_order (20260818090700) deriva todo de auth.uid() -- por diseño, correcto para
-- cuando confirma un humano logueado. El webhook de Mercado Pago no tiene sesión de usuario
-- (auth.uid() es NULL ahí), así que necesita una función hermana propia. Mismo espíritu que el
-- fix de seguridad ya aplicado: nunca confiar en un parámetro espoofeable -- acá la identidad
-- no-espoofeable es "quién puede ser este cliente" (GRANT a service_role), no auth.uid().
-- =====================================================

-- 1) confirm_store_order: sin cambiar firma ni permisos, solo agrega sale_id al UPDATE final --
--    gap que hacía falta cerrar para poder ubicar la venta de un pedido en un reembolso futuro.
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
     SET status = 'confirmed', confirmed_by = v_confirmed_by, sale_id = v_sale.id,
         confirmed_at = now(), updated_at = now()
   WHERE id = p_store_order_id;

  RETURN v_sale;
END;
$$;

-- 2) confirm_store_order_paid: mismo cuerpo que confirm_store_order, pero sin sesión de usuario
--    -- la llama el webhook cuando Mercado Pago confirma un pago aprobado. created_by = NULL es
--    la señal de "confirmado por el sistema de pago", no hace falta columna nueva para eso.
CREATE OR REPLACE FUNCTION confirm_store_order_paid(
  p_store_order_id uuid,
  p_mp_payment_id  text,
  p_mp_status      text
) RETURNS sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order  store_orders;
  v_item   RECORD;
  v_pb     products_branch;
  v_sale   sales;
BEGIN
  SELECT * INTO v_order FROM store_orders WHERE id = p_store_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_order_not_found';
  END IF;

  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'store_order_not_pending';
  END IF;

  INSERT INTO sales (branch_id, total, subtotal, payment_method, status, created_by)
  VALUES (
    v_order.branch_id, coalesce(v_order.total, 0), coalesce(v_order.subtotal, 0),
    'Online', 'completed', NULL
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
      format('Tienda online (Mercado Pago) — %s', coalesce(v_order.customer_name, 'cliente')),
      v_sale.id, NULL
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
     SET status = 'confirmed', sale_id = v_sale.id,
         mp_payment_id = p_mp_payment_id, mp_status = p_mp_status,
         confirmed_at = now(), updated_at = now()
   WHERE id = p_store_order_id;

  RETURN v_sale;
END;
$$;

REVOKE EXECUTE ON FUNCTION confirm_store_order_paid(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION confirm_store_order_paid(uuid, text, text) TO service_role;

-- 3) cancel_store_order_payment_failed: cuando Mercado Pago notifica un pago rechazado/
--    cancelado. Idempotente -- si el pedido ya no está pending (reintento del webhook, o se
--    resolvió por otra vía), no lo toca y devuelve el pedido tal cual está.
CREATE OR REPLACE FUNCTION cancel_store_order_payment_failed(
  p_store_order_id uuid,
  p_mp_payment_id  text,
  p_mp_status      text
) RETURNS store_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order store_orders;
BEGIN
  SELECT * INTO v_order FROM store_orders WHERE id = p_store_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_order_not_found';
  END IF;

  IF v_order.status = 'pending' THEN
    UPDATE store_orders
       SET status = 'cancelled',
           cancelled_reason = 'mercadopago: ' || p_mp_status,
           mp_payment_id = p_mp_payment_id,
           mp_status = p_mp_status,
           updated_at = now()
     WHERE id = p_store_order_id
    RETURNING * INTO v_order;
  END IF;

  RETURN v_order;
END;
$$;

REVOKE EXECUTE ON FUNCTION cancel_store_order_payment_failed(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cancel_store_order_payment_failed(uuid, text, text) TO service_role;

-- 4) refund_store_order: único punto de entrada para cancelar-con-reembolso un pedido pagado
--    con Mercado Pago, disparado por un humano logueado desde /admin/pedidos (por eso deriva
--    identidad de auth.uid(), igual que confirm_store_order). La llamada real a la API de
--    reembolsos de Mercado Pago pasa antes, en la Edge Function mercadopago-refund -- esta
--    función solo hace la contabilidad local (stock + sales + store_orders) una vez que esa
--    plata ya volvió de verdad.
CREATE OR REPLACE FUNCTION refund_store_order(
  p_store_order_id uuid,
  p_reason         text DEFAULT NULL,
  p_mp_refund_id   text DEFAULT NULL
) RETURNS store_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order        store_orders;
  v_item         RECORD;
  v_pb           products_branch;
  v_confirmed_by uuid;
  v_org_id       uuid;
BEGIN
  SELECT id, organization_id INTO v_confirmed_by, v_org_id
  FROM users WHERE auth_id = auth.uid();

  IF v_confirmed_by IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_order FROM store_orders WHERE id = p_store_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_order_not_found';
  END IF;

  IF v_org_id <> v_order.organization_id THEN
    RAISE EXCEPTION 'not_authorized_for_this_organization';
  END IF;

  IF v_order.payment_method <> 'mercadopago' THEN
    RAISE EXCEPTION 'not_a_mercadopago_order';
  END IF;

  IF v_order.status NOT IN ('confirmed', 'pending') THEN
    RAISE EXCEPTION 'store_order_not_refundable';
  END IF;

  -- Si sale_id es NULL, el pedido pagó pero nunca llegó a confirmarse (caso "pagado sin
  -- stock" del webhook) -- no hay nada que revertir del lado del stock.
  IF v_order.sale_id IS NOT NULL THEN
    FOR v_item IN
      SELECT * FROM store_order_items WHERE store_order_id = p_store_order_id
    LOOP
      SELECT pb.* INTO v_pb
      FROM products_branch pb
      WHERE pb.product_id = v_item.product_id
        AND pb.branch_id = v_order.branch_id;

      -- A diferencia de confirm_store_order, si el producto ya no existe en esta sucursal NO
      -- abortamos: para cuando se llega a este punto, la Edge Function ya devolvió la plata en
      -- Mercado Pago -- abortar dejaría el registro local desincronizado de lo que ya pasó de
      -- verdad. Se salta ese ítem y se sigue con el resto.
      IF FOUND THEN
        PERFORM adjust_branch_stock(
          v_pb.id, v_item.quantity, 'return_in',
          format('Reembolso pedido online #%s', left(p_store_order_id::text, 8)),
          p_reason,
          v_order.sale_id, v_confirmed_by
        );
      END IF;
    END LOOP;

    UPDATE sales SET status = 'voided' WHERE id = v_order.sale_id;
  END IF;

  UPDATE store_orders
     SET status = 'refunded', refunded_by = v_confirmed_by, refunded_at = now(),
         refund_reason = p_reason, mp_refund_id = p_mp_refund_id, updated_at = now()
   WHERE id = p_store_order_id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

REVOKE EXECUTE ON FUNCTION refund_store_order(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION refund_store_order(uuid, text, text) TO authenticated;

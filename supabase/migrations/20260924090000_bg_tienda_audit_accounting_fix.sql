-- =====================================================
-- MIGRACIÓN: bg-tienda — corrige el total contable de ventas online + guarda el costo real
-- de Mercado Pago para reportes
--
-- Hallazgo #5 de la auditoría (2026-09-22): confirm_store_order/confirm_store_order_paid
-- insertaban store_orders.total tal cual en sales.total -- ese total incluye la comisión de
-- la PLATAFORMA (1%, va a la plataforma vía marketplace_fee, nunca llega a la cuenta del
-- vendedor) y el envío. Guardarlo así sobreestima el ingreso por venta en accounting.ts/P&L.
--
-- Fix: sales.total pasa a ser "lo que la tienda efectivamente recibe" = total - comisión de
-- la plataforma (subtotal + envío, que sí llega a la cuenta del vendedor vía Mercado Pago).
-- sales.subtotal no cambia (ya era correcto: solo productos, ver mercadopago-checkout
-- líneas 73-77).
--
-- Además: el arancel PROPIO de Mercado Pago (lo que le cobra al vendedor aparte de la
-- comisión de la plataforma) no tenía ninguna columna -- queda 100% invisible salvo mirando
-- la cuenta de Mercado Pago directo. Se agrega mp_fee_details (jsonb crudo de
-- payment.fee_details, tal cual lo devuelve la API de pagos de Mercado Pago) para que quede
-- guardado en el pedido y disponible para reportes futuros -- lo puebla mercadopago-webhook.
-- =====================================================

ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS mp_fee_details jsonb;

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
  v_sale_total    numeric;
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

  -- Lo que efectivamente recibe la tienda: total pagado por el cliente menos la comisión de
  -- la plataforma (que Mercado Pago retiene vía marketplace_fee, nunca llega a esta cuenta).
  v_sale_total := coalesce(v_order.total, 0) - coalesce(v_order.mp_fee_amount, 0);

  INSERT INTO sales (branch_id, total, subtotal, payment_method, status, created_by)
  VALUES (
    v_order.branch_id, v_sale_total, coalesce(v_order.subtotal, 0),
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
  v_order      store_orders;
  v_item       RECORD;
  v_pb         products_branch;
  v_sale       sales;
  v_sale_total numeric;
BEGIN
  SELECT * INTO v_order FROM store_orders WHERE id = p_store_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_order_not_found';
  END IF;

  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'store_order_not_pending';
  END IF;

  v_sale_total := coalesce(v_order.total, 0) - coalesce(v_order.mp_fee_amount, 0);

  INSERT INTO sales (branch_id, total, subtotal, payment_method, status, created_by)
  VALUES (
    v_order.branch_id, v_sale_total, coalesce(v_order.subtotal, 0),
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

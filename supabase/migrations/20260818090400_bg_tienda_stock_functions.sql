-- =====================================================
-- MIGRACIÓN: bg-tienda — descuento de stock atómico + confirmación de pedidos
-- Correr en Supabase SQL Editor
--
-- processSale() en el Electron (src/renderer/store/pos.ts) hoy hace read-then-write sobre
-- products_branch.stock_quantity: sin problema con un solo escritor, pero bg-tienda es un
-- segundo escritor concurrente sobre el mismo stock. adjust_branch_stock() mueve la aritmética
-- al servidor para que dos llamadas simultáneas se serialicen solas contra el lock de fila de
-- Postgres, sin ventana de carrera ni stock negativo.
-- =====================================================

CREATE OR REPLACE FUNCTION adjust_branch_stock(
  p_product_branch_id uuid,
  p_delta             int,          -- negativo = venta/salida, positivo = entrada
  p_transaction_type  text,         -- debe ser uno de los valores permitidos en inventory_movements.transaction_type
  p_reason            text DEFAULT NULL,
  p_notes             text DEFAULT NULL,
  p_sale_id           uuid DEFAULT NULL,
  p_created_by        uuid DEFAULT NULL
) RETURNS products_branch
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row   products_branch;
  v_price numeric;
  v_cost  numeric;
BEGIN
  SELECT price_sale, price_cost INTO v_price, v_cost
  FROM products_branch WHERE id = p_product_branch_id;

  -- La resta/suma se calcula DENTRO del UPDATE, contra el valor bloqueado por Postgres en este
  -- momento: dos llamadas concurrentes sobre el mismo stock se serializan solas.
  UPDATE products_branch
     SET stock_quantity = stock_quantity + p_delta,
         version = version + 1,
         updated_at = now()
   WHERE id = p_product_branch_id
     AND stock_quantity + p_delta >= 0
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_stock';
  END IF;

  INSERT INTO inventory_movements (
    product_branch_id, branch_id, movement_type, transaction_type,
    quantity, stock_before, stock_after, price_at_movement, cost_at_movement,
    sale_id, reason, notes, created_by
  ) VALUES (
    p_product_branch_id, v_row.branch_id,
    CASE WHEN p_delta < 0 THEN 'exit' ELSE 'entry' END,   -- mismo valor que usa pos.ts para ventas
    p_transaction_type,
    abs(p_delta), v_row.stock_quantity - p_delta, v_row.stock_quantity,
    v_price, v_cost, p_sale_id, p_reason, p_notes, p_created_by
  );

  RETURN v_row;
END;
$$;

-- Confirma un pedido pendiente: descuenta stock de cada línea (todo o nada, misma transacción),
-- registra la venta en sales/sale_items (para que Reportes de bg-gestion la vea también), y
-- marca el pedido como confirmado. Si algún ítem no tiene stock suficiente, no se confirma nada.
CREATE OR REPLACE FUNCTION confirm_store_order(
  p_store_order_id uuid,
  p_confirmed_by   uuid
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
  v_org_id uuid;
BEGIN
  SELECT * INTO v_order FROM store_orders WHERE id = p_store_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_order_not_found';
  END IF;

  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'store_order_not_pending';
  END IF;

  -- SECURITY DEFINER bypasea RLS: hay que validar el tenant a mano acá adentro.
  SELECT organization_id INTO v_org_id FROM users WHERE id = p_confirmed_by;

  IF v_org_id IS NULL OR v_org_id <> v_order.organization_id THEN
    RAISE EXCEPTION 'not_authorized_for_this_organization';
  END IF;

  INSERT INTO sales (branch_id, total, subtotal, payment_method, status, created_by)
  VALUES (
    v_order.branch_id, coalesce(v_order.total, 0), coalesce(v_order.subtotal, 0),
    'Online', 'completed', p_confirmed_by
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
      v_sale.id, p_confirmed_by
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
     SET status = 'confirmed', confirmed_by = p_confirmed_by, confirmed_at = now(), updated_at = now()
   WHERE id = p_store_order_id;

  RETURN v_sale;
END;
$$;

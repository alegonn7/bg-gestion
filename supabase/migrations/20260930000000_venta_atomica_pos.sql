-- Venta del POS en una sola transacción del servidor (atómica) + idempotencia.
--
-- Antes la venta se registraba en varios pasos sueltos desde la app (crear la venta y, por cada
-- producto: insertar el ítem, leer stock, registrar el movimiento, actualizar stock). Si se cortaba
-- la conexión a mitad quedaba una venta corrupta (ítems faltantes, stock sin descontar), y con dos
-- cajas vendiendo el mismo producto el stock se podía pisar (lectura/escritura perdida). Esto pasa
-- todo a una función del servidor: o se registra la venta completa o no se registra nada.
--
-- Idempotencia: la app manda un id propio (client_sale_id). Si por un cuelgue reintenta el cobro,
-- la segunda llamada devuelve la MISMA venta en vez de crear una duplicada.

-- 1. Columna de idempotencia. UNIQUE permite múltiples NULL (ventas viejas y las que no manden id).
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_sale_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS sales_client_sale_id_key ON sales (client_sale_id)
  WHERE client_sale_id IS NOT NULL;

-- 2. Registrar la venta completa de forma atómica.
CREATE OR REPLACE FUNCTION public.process_pos_sale(
  p_client_sale_id      uuid,
  p_branch_id           uuid,
  p_total               numeric,
  p_subtotal            numeric,
  p_discount            numeric,
  p_payment_method      text,
  p_cash_amount         numeric,
  p_card_amount         numeric,
  p_transfer_amount     numeric,
  p_transfer_account_id uuid,
  p_price_mode          text,
  p_items               jsonb
)
RETURNS sales
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user   uuid;
  v_org    uuid;
  v_branch_org uuid;
  v_sale   sales;
  v_item   RECORD;
  v_pb     products_branch;
  v_new_stock integer;
BEGIN
  -- Usuario y organización a partir de la sesión
  SELECT id, organization_id INTO v_user, v_org
  FROM users WHERE auth_id = auth.uid();

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Idempotencia: si ya existe una venta con ese id de cliente, devolverla sin duplicar
  IF p_client_sale_id IS NOT NULL THEN
    SELECT * INTO v_sale FROM sales WHERE client_sale_id = p_client_sale_id;
    IF FOUND THEN
      RETURN v_sale;
    END IF;
  END IF;

  -- La sucursal tiene que ser de la organización del usuario
  SELECT organization_id INTO v_branch_org FROM branches WHERE id = p_branch_id;
  IF v_branch_org IS NULL OR v_branch_org <> v_org THEN
    RAISE EXCEPTION 'branch_not_in_organization';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'empty_cart';
  END IF;

  -- Cabecera de la venta
  INSERT INTO sales (
    branch_id, total, subtotal, discount, payment_method,
    cash_amount, card_amount, transfer_amount, transfer_account_id,
    created_by, status, client_sale_id
  ) VALUES (
    p_branch_id, p_total, p_subtotal, coalesce(p_discount, 0), p_payment_method,
    coalesce(p_cash_amount, 0), coalesce(p_card_amount, 0), coalesce(p_transfer_amount, 0),
    p_transfer_account_id, v_user, 'completed', p_client_sale_id
  )
  RETURNING * INTO v_sale;

  -- Ítems + descuento de stock + movimiento, todo dentro de la misma transacción
  FOR v_item IN
    SELECT * FROM jsonb_to_recordset(p_items)
      AS x(product_branch_id uuid, quantity integer, price numeric, cost numeric, subtotal numeric)
  LOOP
    -- Bloquea la fila del producto para que dos cajas no pisen el stock
    SELECT * INTO v_pb FROM products_branch WHERE id = v_item.product_branch_id FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'product_not_found: %', v_item.product_branch_id;
    END IF;

    IF v_pb.branch_id <> p_branch_id THEN
      RAISE EXCEPTION 'product_not_in_branch: %', v_item.product_branch_id;
    END IF;

    v_new_stock := v_pb.stock_quantity - v_item.quantity;

    UPDATE products_branch
       SET stock_quantity = v_new_stock,
           version = version + 1,
           updated_at = now()
     WHERE id = v_pb.id;

    INSERT INTO sale_items (sale_id, product_branch_id, quantity, price, cost, subtotal)
    VALUES (v_sale.id, v_pb.id, v_item.quantity, v_item.price, v_item.cost, v_item.subtotal);

    INSERT INTO inventory_movements (
      product_branch_id, branch_id, movement_type, transaction_type,
      quantity, stock_before, stock_after, price_at_movement, cost_at_movement,
      sale_id, reason, notes, created_by
    ) VALUES (
      v_pb.id, v_pb.branch_id, 'exit', 'sale',
      v_item.quantity, v_pb.stock_quantity, v_new_stock, v_item.price, v_item.cost,
      v_sale.id, 'Venta #' || left(v_sale.id::text, 8),
      'Método: ' || p_payment_method || ' | Modo precio: ' || coalesce(p_price_mode, 'ars'),
      v_user
    );
  END LOOP;

  RETURN v_sale;
END;
$function$;

REVOKE ALL ON FUNCTION public.process_pos_sale(uuid, uuid, numeric, numeric, numeric, text, numeric, numeric, numeric, uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.process_pos_sale(uuid, uuid, numeric, numeric, numeric, text, numeric, numeric, numeric, uuid, text, jsonb) TO authenticated;

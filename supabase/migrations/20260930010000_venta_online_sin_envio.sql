-- La venta de un pedido online debe registrar SOLO el valor de la mercadería vendida (el subtotal
-- de productos), no el envío.
--
-- Antes se registraba total = (total del pedido − comisión), que para Mercado Pago y transferencia
-- termina siendo subtotal + envío. Ese envío que paga el cliente se le transfiere al correo: no es
-- ingreso del comercio. Contarlo como venta inflaba los ingresos y la ganancia, y distorsionaba el
-- ingreso por producto en Reportes (el ajuste por descuentos quedaba > 1). La comisión de la
-- plataforma la paga el comprador (Mercado Pago la retiene vía marketplace_fee), así que tampoco es
-- un costo del comercio. Resultado correcto: la venta vale el subtotal de la mercadería.
CREATE OR REPLACE FUNCTION public.confirm_store_order(p_store_order_id uuid)
 RETURNS sales
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Solo la mercadería. El envío se le paga al correo (no es ingreso) y la comisión la paga el
  -- comprador; por eso la venta vale el subtotal de productos, no el total cobrado.
  v_sale_total := coalesce(v_order.subtotal, 0);

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
$function$;

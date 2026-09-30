-- Anular una venta = MARCARLA como anulada (status='voided') y devolver el stock con un
-- movimiento de inventario, todo en una sola transacción.
--
-- Antes anular BORRABA la venta, sus ítems y sus movimientos, y devolvía el stock sin dejar
-- registro. No quedaba ningún rastro de qué se anuló, quién ni cuándo, y el contador de "anuladas"
-- siempre daba 0 aunque el resto del código ya esperaba el estado 'voided'. Ahora la venta queda
-- con su historia completa: la contabilidad y los reportes ya excluyen las 'voided' (no cuentan ni
-- como ingreso ni como costo), y la devolución de stock queda asentada como movimiento 'return_in'.
CREATE OR REPLACE FUNCTION public.void_pos_sale(p_sale_id uuid)
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
BEGIN
  SELECT id, organization_id INTO v_user, v_org
  FROM users WHERE auth_id = auth.uid();

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_sale FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sale_not_found';
  END IF;

  -- La venta tiene que ser de la organización del usuario
  SELECT organization_id INTO v_branch_org FROM branches WHERE id = v_sale.branch_id;
  IF v_branch_org IS NULL OR v_branch_org <> v_org THEN
    RAISE EXCEPTION 'sale_not_in_organization';
  END IF;

  IF v_sale.status = 'voided' THEN
    RETURN v_sale; -- idempotente: ya estaba anulada
  END IF;

  -- Devolver el stock de cada ítem, dejando un movimiento 'return_in' que asienta la anulación
  FOR v_item IN
    SELECT product_branch_id, quantity FROM sale_items WHERE sale_id = p_sale_id
  LOOP
    PERFORM adjust_branch_stock(
      v_item.product_branch_id, v_item.quantity, 'return_in',
      'Anulación venta #' || left(p_sale_id::text, 8),
      NULL, p_sale_id, v_user
    );
  END LOOP;

  UPDATE sales SET status = 'voided' WHERE id = p_sale_id
  RETURNING * INTO v_sale;

  RETURN v_sale;
END;
$function$;

REVOKE ALL ON FUNCTION public.void_pos_sale(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.void_pos_sale(uuid) TO authenticated;

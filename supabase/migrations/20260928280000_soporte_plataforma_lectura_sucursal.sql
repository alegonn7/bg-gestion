-- Soporte de plataforma (solo lectura): faltaban las tablas que se filtran por sucursal (no por
-- organización) y sus tablas hijas. Se agrega el permiso de SELECT del super admin también en ellas,
-- acotado a las sucursales de la empresa que está soportando. Aditivo y sin escritura.

-- Sucursales de la empresa que el super admin está soportando ahora
CREATE OR REPLACE FUNCTION public.support_branch_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT id FROM public.branches WHERE organization_id = public.support_org_id()
$$;
REVOKE EXECUTE ON FUNCTION public.support_branch_ids() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.support_branch_ids() TO authenticated;

-- Tablas por sucursal
DO $$
DECLARE
  t text;
  tablas text[] := ARRAY['products_branch', 'sales', 'inventory_movements', 'cash_registers', 'scanned_items'];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    EXECUTE format('DROP POLICY IF EXISTS soporte_ver ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY soporte_ver ON public.%I FOR SELECT TO authenticated '
      || 'USING (public.is_platform_admin() AND branch_id IN (SELECT public.support_branch_ids()))', t);
  END LOOP;
END $$;

-- Ítems de venta (dependen de sales)
DROP POLICY IF EXISTS soporte_ver ON sale_items;
CREATE POLICY soporte_ver ON sale_items FOR SELECT TO authenticated
  USING (public.is_platform_admin() AND sale_id IN (
    SELECT id FROM sales WHERE branch_id IN (SELECT public.support_branch_ids())
  ));

-- Ítems de pedidos de la tienda (dependen de store_orders, que ya tiene organization_id)
DROP POLICY IF EXISTS soporte_ver ON store_order_items;
CREATE POLICY soporte_ver ON store_order_items FOR SELECT TO authenticated
  USING (public.is_platform_admin() AND store_order_id IN (
    SELECT id FROM store_orders WHERE organization_id = public.support_org_id()
  ));

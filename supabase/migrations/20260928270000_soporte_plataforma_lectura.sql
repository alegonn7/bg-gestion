-- Soporte de plataforma (super admin): acceso de SOLO LECTURA a la organización que se está
-- soportando. Se agrega, tabla por tabla, un permiso de SELECT extra para el super admin acotado a
-- support_org_id() (la empresa a la que entró). Es aditivo: no modifica las policies que ya existen,
-- y queda inerte hasta que haya una fila en platform_admins (is_platform_admin() da false).
--
-- Quedan AFUERA a propósito (material secreto que el soporte no necesita ver):
--   fiscal_credentials (clave privada del certificado de ARCA),
--   store_mercadopago_credentials y store_shipping_credentials (tokens de cobro/envío).
-- Tampoco se agrega ningún permiso de escritura: el soporte mira, no opera la cuenta del cliente.

-- La organización en sí (se lee por id, no por organization_id)
DROP POLICY IF EXISTS soporte_ver_organizacion ON organizations;
CREATE POLICY soporte_ver_organizacion ON organizations FOR SELECT TO authenticated
  USING (public.is_platform_admin() AND id = public.support_org_id());

-- El resto de las tablas del negocio, acotadas por organization_id
DO $$
DECLARE
  t text;
  tablas text[] := ARRAY[
    'audit_logs', 'barcode_sheets', 'branches', 'categories', 'conflict_logs',
    'extra_movements', 'fiscal_comprobantes', 'fiscal_onboarding', 'hero_images',
    'products', 'remitos', 'remitos_cai', 'sizes', 'store_orders', 'store_settings',
    'suppliers', 'transfer_accounts', 'users'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    EXECUTE format('DROP POLICY IF EXISTS soporte_ver ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY soporte_ver ON public.%I FOR SELECT TO authenticated '
      || 'USING (public.is_platform_admin() AND organization_id = public.support_org_id())', t);
  END LOOP;
END $$;

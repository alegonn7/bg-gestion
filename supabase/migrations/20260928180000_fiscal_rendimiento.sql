-- Rendimiento de facturación y remitos.

-- 1. Ambiente para las altas nuevas ('dev' = modo prueba, 'prod' = facturas reales).
--    Vive en la base para que la configuración se lea con una sola consulta.
CREATE TABLE IF NOT EXISTS fiscal_parametros (
  id             int  PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ambiente_nuevo text NOT NULL DEFAULT 'dev' CHECK (ambiente_nuevo IN ('dev', 'prod'))
);
INSERT INTO fiscal_parametros (id, ambiente_nuevo) VALUES (1, 'dev') ON CONFLICT (id) DO NOTHING;
-- Sin policies: solo el servidor y fiscal_config() la leen
ALTER TABLE fiscal_parametros ENABLE ROW LEVEL SECURITY;

-- 2. Configuración fiscal de la organización del usuario en una sola consulta (antes pasaba por
--    la Edge Function fiscal-setup). Devuelve solo datos no sensibles: nunca el certificado.
CREATE OR REPLACE FUNCTION public.fiscal_config() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'config', jsonb_build_object(
      'fiscal_enabled', o.fiscal_enabled,
      'cuit', o.cuit,
      'razon_social', o.razon_social,
      'condicion_iva', o.condicion_iva,
      'punto_venta', o.punto_venta,
      'actividad_afip', o.actividad_afip,
      'domicilio_comercial', o.domicilio_comercial,
      'ingresos_brutos', o.ingresos_brutos,
      'inicio_actividades', o.inicio_actividades,
      'ambiente', coalesce(c.ambiente, p.ambiente_nuevo),
      'conectado', coalesce(c.activo, false)
    ),
    'alta', CASE WHEN a.organization_id IS NULL THEN NULL ELSE jsonb_build_object(
      'paso', a.paso, 'estado', a.estado, 'error', a.error, 'punto_venta', a.punto_venta
    ) END,
    'ambiente_nuevo', p.ambiente_nuevo
  )
  FROM public.users u
  JOIN public.organizations o ON o.id = u.organization_id
  CROSS JOIN public.fiscal_parametros p
  LEFT JOIN public.fiscal_credentials c ON c.organization_id = o.id
  LEFT JOIN public.fiscal_onboarding a ON a.organization_id = o.id
  WHERE u.auth_id = (SELECT auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.fiscal_config() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_config() TO authenticated;

-- 3. Policies: auth.uid() evaluado una sola vez por consulta, no por fila
DROP POLICY IF EXISTS "fiscal_comprobantes_org_select" ON fiscal_comprobantes;
CREATE POLICY "fiscal_comprobantes_org_select" ON fiscal_comprobantes FOR SELECT
  USING (organization_id = (SELECT organization_id FROM users WHERE auth_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS remitos_select ON remitos;
DROP POLICY IF EXISTS remitos_insert ON remitos;
DROP POLICY IF EXISTS remitos_update ON remitos;
CREATE POLICY remitos_select ON remitos FOR SELECT
  USING (organization_id = (SELECT organization_id FROM users WHERE auth_id = (SELECT auth.uid())));
CREATE POLICY remitos_insert ON remitos FOR INSERT
  WITH CHECK (organization_id = (SELECT organization_id FROM users WHERE auth_id = (SELECT auth.uid())));
CREATE POLICY remitos_update ON remitos FOR UPDATE
  USING (organization_id = (SELECT organization_id FROM users WHERE auth_id = (SELECT auth.uid())))
  WITH CHECK (organization_id = (SELECT organization_id FROM users WHERE auth_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS remitos_cai_select ON remitos_cai;
CREATE POLICY remitos_cai_select ON remitos_cai FOR SELECT
  USING (organization_id = (SELECT organization_id FROM users WHERE auth_id = (SELECT auth.uid())));

-- 4. Índices de claves foráneas (el saldo de una factura busca sus notas por original_comprobante_id)
CREATE INDEX IF NOT EXISTS idx_fiscal_comprobantes_original ON fiscal_comprobantes (original_comprobante_id);
CREATE INDEX IF NOT EXISTS idx_remitos_branch ON remitos (branch_id);
CREATE INDEX IF NOT EXISTS idx_remitos_created_by ON remitos (created_by);
CREATE INDEX IF NOT EXISTS idx_remitos_sucursal_destino ON remitos (sucursal_destino_id);

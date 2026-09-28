-- Alta manual en ARCA: cuando no quedan automatizaciones de Afip SDK, el cliente hace los trámites
-- en la página de ARCA siguiendo un paso a paso de la app (también para pedir el CAI de remitos).

-- 1. Cuándo se terminaron las automatizaciones: por un día la app muestra el paso a paso.
--    Si se contrata el adicional antes, se vuelve a lo automático poniéndola en null.
ALTER TABLE fiscal_parametros ADD COLUMN IF NOT EXISTS automatizaciones_agotadas timestamptz;

-- 2. Pedido de certificado (CSR) del alta manual. No es secreto: la clave queda en fiscal_credentials
ALTER TABLE fiscal_onboarding ADD COLUMN IF NOT EXISTS csr text;

-- 3. La configuración suma si hay que hacer los trámites a mano y el alias del certificado
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
      'paso', a.paso, 'estado', a.estado, 'error', a.error, 'punto_venta', a.punto_venta, 'cert_alias', a.cert_alias
    ) END,
    'ambiente_nuevo', p.ambiente_nuevo,
    'sin_automatizaciones', coalesce(p.automatizaciones_agotadas > now() - interval '24 hours', false)
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

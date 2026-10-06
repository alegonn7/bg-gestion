-- BG Gestión autogestionable (alta desde binarygoats.com.ar/bg-gestion/empezar, misma Edge Function
-- alta-tienda con producto "gestion").
--
-- 1. Precios de la landing: Profesional $40.000 y Premium $70.000 por mes (el primer mes al 50% lo
--    calcula alta-tienda). "inicial" queda en la tabla para las cuentas que lo tengan, pero la
--    landing ya no lo ofrece y alta-tienda no lo acepta.
UPDATE plan_config SET price_per_branch = 70000 WHERE plan_name = 'premium';
UPDATE plan_config SET price_per_branch = 40000 WHERE plan_name = 'profesional';

-- 2. Sincronización diaria de todas las suscripciones (Edge Function sincronizar-suscripciones):
--    registra cobros mensuales, rechazos y cancelaciones hechas desde Mercado Pago aunque el aviso
--    del webhook se pierda. La función solo responde a quien manda la clave guardada en Vault.
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'sincronizar_suscripciones_clave') THEN
    PERFORM vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'sincronizar_suscripciones_clave');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.clave_cron_valida(p_clave text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(length(p_clave) > 0 AND p_clave = (
    SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sincronizar_suscripciones_clave'
  ), false)
$$;

REVOKE ALL ON FUNCTION public.clave_cron_valida(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clave_cron_valida(text) TO service_role;

SELECT cron.unschedule('sincronizar-suscripciones')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sincronizar-suscripciones');

-- 09:00 UTC = 06:00 en Argentina.
SELECT cron.schedule(
  'sincronizar-suscripciones',
  '0 9 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://eawotrxenraxxeozqpkv.supabase.co/functions/v1/sincronizar-suscripciones',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-clave-cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sincronizar_suscripciones_clave')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  $cron$
);

-- Pago por plan: cada alta (y cada reactivación) crea su propio plan de Mercado Pago
-- (preapproval_plan) y el cliente paga con la cuenta que quiera. La suscripción se vincula después
-- (webhook, bienvenida o el chequeo cada 10 minutos) buscando las del plan.
ALTER TABLE public.platform_subscriptions ADD COLUMN IF NOT EXISTS mp_plan_id text;
CREATE UNIQUE INDEX IF NOT EXISTS platform_subscriptions_mp_plan_id_key ON public.platform_subscriptions (mp_plan_id);

SELECT cron.unschedule('sincronizar-suscripciones-pendientes')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sincronizar-suscripciones-pendientes');

-- Cada 10 minutos, solo los links de pago por plan que todavía no tienen suscripción.
SELECT cron.schedule(
  'sincronizar-suscripciones-pendientes',
  '*/10 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://eawotrxenraxxeozqpkv.supabase.co/functions/v1/sincronizar-suscripciones',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-clave-cron', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sincronizar_suscripciones_clave')
    ),
    body := '{"pendientes": true}'::jsonb,
    timeout_milliseconds := 120000
  )
  $cron$
);

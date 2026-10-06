// Edge Function: sincronizar-suscripciones
// La llama pg_cron una vez por día (migración 20261006200000_bg_gestion_autoservicio). Relee de
// Mercado Pago todas las suscripciones vigentes: así se registran los cobros mensuales, los
// rechazos y las cancelaciones hechas desde Mercado Pago aunque el aviso del webhook se pierda.
// Es la única forma de cancelar de BG Gestión por ahora (el programa no tiene "Mi suscripción").
// Solo responde a quien manda la clave que guarda el cron en Vault (header x-clave-cron).

import { createClient } from "npm:@supabase/supabase-js@2"
import { sincronizarSuscripcion } from "../_shared/suscripciones.ts"

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405)

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  const clave = req.headers.get("x-clave-cron") ?? ""
  const { data: valida } = await admin.rpc("clave_cron_valida", { p_clave: clave })
  if (valida !== true) return json({ ok: false }, 401)

  // Las pending las sincroniza la bienvenida y se borran solas a las 48 h; las canceladas que ya
  // vencieron no cambian más.
  const { data: subs, error } = await admin
    .from("platform_subscriptions")
    .select("organization_id, mp_preapproval_id, organizations!inner(subscription_status)")
    .not("mp_preapproval_id", "is", null)
    .in("organizations.subscription_status", ["active", "past_due", "suspended"])
  if (error) {
    console.error("sincronizar-suscripciones: no se pudieron leer las suscripciones", error)
    return json({ ok: false }, 500)
  }

  let revisadas = 0
  let fallidas = 0
  for (const sub of subs ?? []) {
    try {
      await sincronizarSuscripcion(admin, { organizationId: sub.organization_id })
      revisadas++
    } catch (err) {
      fallidas++
      console.error("sincronizar-suscripciones: falló", sub.organization_id, err)
    }
  }
  return json({ ok: true, revisadas, fallidas })
})

function json(data: object, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })
}

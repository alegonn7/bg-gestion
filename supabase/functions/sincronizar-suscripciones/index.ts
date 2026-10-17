// Edge Function: sincronizar-suscripciones
// La llama pg_cron una vez por día (migración 20261006200000_bg_gestion_autoservicio). Relee de
// Mercado Pago todas las suscripciones vigentes: así se registran los cobros mensuales, los
// rechazos y las cancelaciones hechas desde Mercado Pago aunque el aviso del webhook se pierda.
// Es la única forma de cancelar de BG Gestión por ahora (el programa no tiene "Mi suscripción").
// Con {"pendientes": true} (otro cron, cada 10 minutos) solo revisa los links de pago por plan que
// todavía no tienen suscripción: así una compra o una reactivación se activa aunque el cliente no
// vuelva a la página y el aviso de Mercado Pago se pierda. Las altas que no se pagaron en 46 horas
// dan de baja su plan, justo antes de que limpiar_altas_sin_pagar() las borre.
// Solo responde a quien manda la clave que guarda el cron en Vault (header x-clave-cron).

import { createClient } from "npm:@supabase/supabase-js@2"
import { cancelarPlanMP, sincronizarSuscripcion } from "../_shared/suscripciones.ts"

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false }, 405)

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
  const clave = req.headers.get("x-clave-cron") ?? ""
  const { data: valida } = await admin.rpc("clave_cron_valida", { p_clave: clave })
  if (valida !== true) return json({ ok: false }, 401)

  const body = await req.json().catch(() => ({}) as any)
  if (body?.pendientes === true) return json(await revisarPendientes(admin))

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

const PLAZO_ALTA_MS = 46 * 60 * 60 * 1000
const PLAZO_REACTIVACION_MS = 3 * 24 * 60 * 60 * 1000

// deno-lint-ignore no-explicit-any
async function revisarPendientes(admin: any) {
  const { data: subs, error } = await admin
    .from("platform_subscriptions")
    .select("organization_id, mp_plan_id, mp_status, created_at, organizations!inner(subscription_status)")
    .not("mp_plan_id", "is", null)
    .is("mp_preapproval_id", null)
    .gte("updated_at", new Date(Date.now() - PLAZO_REACTIVACION_MS).toISOString())
  if (error) {
    console.error("sincronizar-suscripciones: no se pudieron leer los pendientes", error)
    return { ok: false }
  }

  let vinculadas = 0
  let abandonadas = 0
  for (const sub of subs ?? []) {
    if (sub.mp_status === "abandonada") continue
    try {
      const resultado = await sincronizarSuscripcion(admin, { organizationId: sub.organization_id })
      if (resultado) {
        vinculadas++
        continue
      }
      // Alta sin pagar a punto de borrarse: su link deja de cobrar.
      const pendiente = sub.organizations?.subscription_status === "pending"
      if (pendiente && Date.now() - Date.parse(sub.created_at) > PLAZO_ALTA_MS) {
        await cancelarPlanMP(sub.mp_plan_id)
        await admin.from("platform_subscriptions").update({ mp_status: "abandonada" }).eq("organization_id", sub.organization_id)
        abandonadas++
      }
    } catch (err) {
      console.error("sincronizar-suscripciones: falló un pendiente", sub.organization_id, err)
    }
  }
  return { ok: true, revisadas: subs?.length ?? 0, vinculadas, abandonadas }
}

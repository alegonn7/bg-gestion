// Edge Function: cancelar-suscripcion
// Botón "Cancelar suscripción" de Mi suscripción, en el panel de BG Tienda. Solo el dueño de la
// organización. Cancela la suscripción en Mercado Pago (con la cuenta de Binary Goats, que es la
// que la creó) y después la sincroniza: si ya pagó, la tienda sigue activa hasta el final del mes
// pagado y el cron la suspende al vencer (mismo camino que si cancelara desde Mercado Pago).

import { createClient } from "npm:@supabase/supabase-js@2"
import { usuarioDeLaSesion } from "../_shared/sesion.ts"
import { mpFetch, sincronizarSuscripcion } from "../_shared/suscripciones.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return errorResponse("Método no permitido", 405)

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return errorResponse("No autorizado", 401)

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
    const authId = await usuarioDeLaSesion(admin, authHeader)
    if (!authId) return errorResponse("No autorizado", 401)

    const { data: actor } = await admin
      .from("users")
      .select("organization_id, role, is_active")
      .eq("auth_id", authId)
      .maybeSingle()
    if (!actor?.is_active || actor.role !== "owner") return errorResponse("Solo el dueño de la cuenta puede cancelar la suscripción", 403)

    const { data: sub } = await admin
      .from("platform_subscriptions")
      .select("mp_preapproval_id, cancelled_at")
      .eq("organization_id", actor.organization_id)
      .maybeSingle()
    if (!sub?.mp_preapproval_id) return errorResponse("Tu cuenta no tiene una suscripción automática", 404)

    if (!sub.cancelled_at) {
      const r = await mpFetch(`/preapproval/${encodeURIComponent(sub.mp_preapproval_id)}`, {
        method: "PUT",
        body: JSON.stringify({ status: "cancelled" }),
      })
      // Si ya estaba cancelada en Mercado Pago, el PUT puede fallar: la sincronización lo resuelve.
      if (!r.ok) console.error("cancelar-suscripcion: Mercado Pago respondió", sub.mp_preapproval_id, r.status, r.data)
    }

    await sincronizarSuscripcion(admin, { organizationId: actor.organization_id })

    const [{ data: despues }, { data: org }] = await Promise.all([
      admin.from("platform_subscriptions").select("cancelled_at").eq("organization_id", actor.organization_id).single(),
      admin.from("organizations").select("subscription_status, subscription_ends_at").eq("id", actor.organization_id).single(),
    ])
    if (!despues?.cancelled_at) return errorResponse("Mercado Pago no confirmó la cancelación. Probá de nuevo en unos minutos.", 502)

    return jsonResponse({ ok: true, estado: org?.subscription_status ?? null, activaHasta: org?.subscription_ends_at ?? null })
  } catch (err: any) {
    console.error("cancelar-suscripcion error:", err)
    return errorResponse("No pudimos cancelar la suscripción. Probá de nuevo en unos minutos.", 500)
  }
})

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

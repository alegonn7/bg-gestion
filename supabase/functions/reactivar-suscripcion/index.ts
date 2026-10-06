// Edge Function: reactivar-suscripcion
// Botón "Reactivar suscripción" de Mi suscripción, en el panel de BG Tienda. Solo el dueño, y solo
// si la suscripción está cancelada o la cuenta suspendida. Crea una suscripción nueva en Mercado
// Pago a precio completo (el 50% es solo para el primer mes de un alta) y devuelve el link de pago.
// Si canceló pero todavía tiene el mes pago, la nueva arranca a cobrar el día que vencía, así no
// paga dos veces el mismo mes. La cuenta se reactiva cuando sincronizarSuscripcion() ve la nueva
// autorizada (webhook, o accion "sincronizar" que llama el panel al volver de Mercado Pago).

import { createClient } from "npm:@supabase/supabase-js@2"
import { usuarioDeLaSesion } from "../_shared/sesion.ts"
import { mpFetch, sincronizarSuscripcion, storeSiteUrl } from "../_shared/suscripciones.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// Margen para no programar el primer cobro en el pasado si el mes pago vence en minutos.
const MARGEN_INICIO_MS = 60 * 60 * 1000

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
    if (!actor?.is_active || actor.role !== "owner") return errorResponse("Solo el dueño de la cuenta puede reactivar la suscripción", 403)
    const organizationId = actor.organization_id as string

    const body = await req.json().catch(() => ({}) as any)

    // Al volver de Mercado Pago: releer el estado sin esperar el webhook.
    if (body?.accion === "sincronizar") {
      await sincronizarSuscripcion(admin, { organizationId })
      const [{ data: sub }, { data: org }] = await Promise.all([
        admin.from("platform_subscriptions").select("cancelled_at").eq("organization_id", organizationId).maybeSingle(),
        admin.from("organizations").select("subscription_status").eq("id", organizationId).single(),
      ])
      return jsonResponse({ reactivada: !!sub && !sub.cancelled_at && org?.subscription_status === "active" })
    }

    const [{ data: sub }, { data: org }] = await Promise.all([
      admin
        .from("platform_subscriptions")
        .select("id, mp_preapproval_id, mp_status, cancelled_at, full_amount, contact_email, payer_email")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      admin.from("organizations").select("name, subscription_status, subscription_ends_at").eq("id", organizationId).single(),
    ])
    if (!sub?.mp_preapproval_id || !org) return errorResponse("Tu cuenta no tiene una suscripción automática", 404)
    if (!sub.cancelled_at && org.subscription_status !== "suspended") return errorResponse("Tu suscripción ya está activa", 409)

    // La suscripción actual (la cancelada, una reactivación anterior que quedó sin pagar, o la de una
    // cuenta suspendida por atraso que Mercado Pago sigue reintentando) se cancela antes de crear la
    // nueva: nunca puede haber dos cobrando a la vez.
    if (sub.mp_status !== "cancelled") {
      const r = await mpFetch(`/preapproval/${encodeURIComponent(sub.mp_preapproval_id)}`, {
        method: "PUT",
        body: JSON.stringify({ status: "cancelled" }),
      })
      if (!r.ok) {
        const actual = await mpFetch(`/preapproval/${encodeURIComponent(sub.mp_preapproval_id)}`)
        if (actual.data?.status !== "cancelled") {
          console.error("reactivar-suscripcion: no se pudo cancelar la suscripción anterior", sub.mp_preapproval_id, r.status, r.data)
          return errorResponse("No pudimos preparar la reactivación. Probá de nuevo en unos minutos.", 502)
        }
      }
    }

    const vence = org.subscription_ends_at ? Date.parse(org.subscription_ends_at) : 0
    const conMesPago = org.subscription_status !== "suspended" && vence > Date.now() + MARGEN_INICIO_MS
    const monto = Number(sub.full_amount)

    const preapproval = await mpFetch("/preapproval", {
      method: "POST",
      body: JSON.stringify({
        reason: `BG Tienda — ${org.name}`,
        external_reference: organizationId,
        payer_email: sub.payer_email ?? sub.contact_email,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: monto,
          currency_id: "ARS",
          ...(conMesPago ? { start_date: new Date(vence).toISOString() } : {}),
        },
        back_url: `${storeSiteUrl()}/admin/suscripcion?reactivar=1`,
        notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/suscripciones-webhook`,
        status: "pending",
      }),
    }).catch((err) => {
      console.error("reactivar-suscripcion: falló la llamada a Mercado Pago", err)
      return { ok: false, status: 0, data: null }
    })
    if (!preapproval.ok || !preapproval.data?.id || !preapproval.data?.init_point) {
      console.error("reactivar-suscripcion: Mercado Pago no creó la suscripción", preapproval.status, preapproval.data)
      return errorResponse("No pudimos conectar con Mercado Pago. Probá de nuevo en unos minutos.", 502)
    }

    // cancelled_at queda puesto hasta que la nueva se autorice: así, si no termina de pagar, la cuenta
    // sigue como estaba (vence o sigue suspendida) y puede volver a intentarlo.
    await admin
      .from("platform_subscriptions")
      .update({
        mp_preapproval_id: String(preapproval.data.id),
        mp_status: preapproval.data.status ?? "pending",
        current_amount: monto,
        cancelled_at: sub.cancelled_at ?? new Date().toISOString(),
        next_payment_date: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id)

    return jsonResponse({ ok: true, init_point: preapproval.data.init_point })
  } catch (err: any) {
    console.error("reactivar-suscripcion error:", err)
    return errorResponse("No pudimos reactivar la suscripción. Probá de nuevo en unos minutos.", 500)
  }
})

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

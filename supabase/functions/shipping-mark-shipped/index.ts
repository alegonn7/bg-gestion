// Edge Function: shipping-mark-shipped
// Marca un pedido con envío a domicilio como despachado: guarda el código de seguimiento y le
// manda un email al cliente avisándole, desde la misma cuenta (_shared/email.ts) que ya usa
// mercadopago-webhook para el resto de los emails de pedido.
//
// Sin restricción de role (owner/admin) a propósito: cualquier miembro de la organización ya
// puede confirmar/cancelar pedidos (ver confirm_store_order/cancel_store_order, que solo piden
// pertenecer a la organización) -- despachar un pedido es la misma categoría de tarea operativa,
// no mueve plata como sí hace mercadopago-refund.

import { createClient } from "npm:@supabase/supabase-js@2"
import { sendEmail } from "../_shared/email.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return errorResponse("No autorizado", 401)

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return errorResponse("No autorizado", 401)

    const { data: dbUser } = await supabase
      .from("users")
      .select("id, organization_id")
      .eq("auth_id", user.id)
      .maybeSingle()

    if (!dbUser) return errorResponse("Usuario no encontrado", 404)

    const { storeOrderId, trackingCode } = await req.json()
    if (!storeOrderId || !trackingCode?.trim()) return errorResponse("Falta storeOrderId o trackingCode")

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    const { data: order } = await adminSupabase
      .from("store_orders")
      .select("*, organizations(slug, name)")
      .eq("id", storeOrderId)
      .maybeSingle()

    if (!order) return errorResponse("Pedido no encontrado", 404)
    if (order.organization_id !== dbUser.organization_id) return errorResponse("Sin permisos", 403)
    if (order.delivery_method !== "shipping") return errorResponse("Este pedido no es de envío a domicilio")
    if (order.status !== "confirmed") return errorResponse("Este pedido todavía no está pago/confirmado")

    const trimmedCode = trackingCode.trim()
    const { error } = await adminSupabase
      .from("store_orders")
      .update({ tracking_code: trimmedCode, shipped_at: new Date().toISOString() })
      .eq("id", storeOrderId)

    if (error) return errorResponse(error.message, 500)

    // Best-effort, igual que en mercadopago-webhook: si el email falla no revertimos el
    // despacho ya guardado, solo queda logueado.
    try {
      if (order.customer_email) {
        const org = order.organizations as { slug: string; name: string } | null
        const storeName = org?.name ?? "tu tienda"
        const siteUrl = Deno.env.get("ECOMERSE_SITE_URL")
        const orderUrl = siteUrl && org?.slug ? `${siteUrl}/${org.slug}/pedido/${order.id}` : null
        const carrierLabel =
          order.shipping_carrier === "andreani"
            ? "Andreani"
            : order.shipping_carrier === "correo_argentino"
              ? "Correo Argentino"
              : null

        await sendEmail({
          to: order.customer_email,
          subject: `Tu pedido #${order.order_number} ya fue despachado`,
          html:
            `<div style="font-family:sans-serif;">` +
            `<p style="color:#6b6b6b;">Pedido #${order.order_number}</p>` +
            `<h2>¡Tu pedido está en camino!</h2>` +
            `<p>${carrierLabel ? `Lo despachamos por ${carrierLabel}. ` : ""}Código de seguimiento:</p>` +
            `<p style="font-size:18px; font-weight:bold;">${trimmedCode}</p>` +
            (orderUrl ? `<p><a href="${orderUrl}">Ver el detalle del pedido</a></p>` : "") +
            `</div>`,
          fromName: storeName,
        })
      }
    } catch (err) {
      console.error("shipping-mark-shipped: sendEmail falló", storeOrderId, err)
    }

    return jsonResponse({ ok: true })
  } catch (err: any) {
    console.error("shipping-mark-shipped error:", err)
    return errorResponse(err.message || "Error interno", 500)
  }
})

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

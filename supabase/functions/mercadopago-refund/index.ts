// Edge Function: mercadopago-refund
// Reembolsa un pedido pagado con Mercado Pago. Patrón fiscal-setup para la parte de sesión,
// restringido a owner/admin (más estricto que confirmar/cancelar un pedido normal -- mover
// plata de vuelta pesa más). Un solo punto de entrada del lado de la Edge Function también:
// primero se confirma el reembolso en Mercado Pago, y SOLO si eso funcionó se actualiza la
// base local vía refund_store_order -- nunca al revés.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2"
import { getValidSellerAccessToken, MercadoPagoNotConnectedError } from "../_shared/mercadopago.ts"
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
      .select("id, organization_id, role")
      .eq("auth_id", user.id)
      .single()

    if (!dbUser || !["owner", "admin"].includes(dbUser.role)) {
      return errorResponse("Sin permisos", 403)
    }

    const { storeOrderId, reason } = await req.json()
    if (!storeOrderId) return errorResponse("Falta storeOrderId")

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    const { data: order } = await adminSupabase
      .from("store_orders")
      .select("*")
      .eq("id", storeOrderId)
      .single()

    if (!order) return errorResponse("Pedido no encontrado", 404)
    if (order.organization_id !== dbUser.organization_id) return errorResponse("Sin permisos", 403)
    if (order.payment_method !== "mercadopago") return errorResponse("Este pedido no es de Mercado Pago")
    if (!order.mp_payment_id) return errorResponse("Este pedido no tiene un pago de Mercado Pago asociado")
    if (!["confirmed", "pending"].includes(order.status)) return errorResponse("Este pedido no se puede reembolsar")

    let sellerAccessToken: string
    try {
      sellerAccessToken = await getValidSellerAccessToken(adminSupabase, order.organization_id)
    } catch (err) {
      if (err instanceof MercadoPagoNotConnectedError) {
        return errorResponse("Esta tienda no tiene Mercado Pago conectado")
      }
      throw err
    }

    // 3 reintentos con backoff 2s/4s/6s. Los reembolsos split de Mercado Pago no se pueden
    // probar de punta a punta en sandbox -- probar en producción con montos chicos.
    // X-Idempotency-Key: obligatorio desde que MP lo exige en este endpoint -- misma key en
    // los 3 reintentos (es el mismo reembolso lógico) para que MP los trate como el mismo
    // pedido y nunca termine reembolsando dos veces si un intento anterior sí llegó a procesarse
    // pero la respuesta no volvió a tiempo.
    const idempotencyKey = crypto.randomUUID()
    let refund: any = null
    let lastError = ""
    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${order.mp_payment_id}/refunds`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sellerAccessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey,
        },
      })
      const data = await response.json().catch(() => null)

      if (response.ok && data?.id) {
        refund = data
        break
      }

      const message = (data?.message ?? "").toLowerCase()
      const insufficientFunds = response.status === 400 &&
        (message.includes("insufficient") || data?.cause?.[0]?.code === "insufficient_amount")

      if (insufficientFunds) {
        return errorResponse(
          "El vendedor no tiene fondos suficientes en su cuenta de Mercado Pago para este reembolso. Requiere intervención manual.",
          409,
        )
      }

      lastError = JSON.stringify(data)
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 2000 * attempt))
    }

    if (!refund) {
      return errorResponse(`No se pudo procesar el reembolso en Mercado Pago: ${lastError}`, 500)
    }

    // Solo si el refund en MP fue exitoso: la contabilidad local, con el cliente de SESIÓN (no
    // adminSupabase) -- para que refund_store_order derive auth.uid() correctamente, igual que
    // confirm_store_order.
    const { error: refundError } = await supabase.rpc("refund_store_order", {
      p_store_order_id: storeOrderId,
      p_reason: reason ?? null,
      p_mp_refund_id: String(refund.id),
    })

    if (refundError) {
      console.error("mercadopago-refund: reembolso en MP ok pero refund_store_order falló", storeOrderId, refundError.message)
      return errorResponse(
        `El reembolso se procesó en Mercado Pago pero no se pudo actualizar el pedido (${refundError.message}). Contactá soporte.`,
        500,
      )
    }

    // Best-effort, igual que en mercadopago-webhook: la plata ya volvió y el pedido ya quedó
    // marcado como reembolsado -- que el email falle no puede revertir nada de eso.
    await sendRefundEmail(adminSupabase, storeOrderId).catch((err) =>
      console.error("mercadopago-refund: sendRefundEmail falló", storeOrderId, err),
    )

    return jsonResponse({ ok: true })
  } catch (err: any) {
    console.error("mercadopago-refund error:", err)
    return errorResponse(err.message || "Error interno", 500)
  }
})

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

async function sendRefundEmail(adminSupabase: SupabaseClient, storeOrderId: string): Promise<void> {
  const { data: order } = await adminSupabase
    .from("store_orders")
    .select("*, store_order_items(*), organizations(slug, name)")
    .eq("id", storeOrderId)
    .single()

  if (!order?.customer_email) return

  const org = order.organizations as { slug: string; name: string } | null
  const storeName = org?.name ?? "tu tienda"
  const siteUrl = Deno.env.get("ECOMERSE_SITE_URL")
  const orderUrl = siteUrl && org?.slug ? `${siteUrl}/${org.slug}/pedido/${order.id}` : null

  const itemsHtml = ((order.store_order_items ?? []) as any[])
    .map(
      (item) =>
        `<tr><td style="padding:4px 8px 4px 0;">${item.product_name}${item.size ? ` (${item.size})` : ""} × ${item.quantity}</td>` +
        `<td style="padding:4px 0; text-align:right; white-space:nowrap;">${formatArs(item.subtotal)}</td></tr>`,
    )
    .join("")
  const totalRow =
    `<tr><td style="padding:8px 8px 0 0; font-weight:bold;">Total reembolsado</td>` +
    `<td style="padding:8px 0 0; text-align:right; font-weight:bold;">${formatArs(order.total)}</td></tr>`
  const linkHtml = orderUrl ? `<p><a href="${orderUrl}">Ver el detalle del pedido</a></p>` : ""

  await sendEmail({
    to: order.customer_email,
    subject: `Tu pedido #${order.order_number} fue reembolsado`,
    html:
      `<div style="font-family:sans-serif;">` +
      `<p style="color:#6b6b6b;">Pedido #${order.order_number}</p>` +
      `<h2>Te reembolsamos tu compra</h2>` +
      `<p>El dinero ya vuelve a tu medio de pago. Puede tardar unos días en reflejarse.</p>` +
      `<table style="border-collapse:collapse; width:100%; max-width:480px;">${itemsHtml}${totalRow}</table>` +
      linkHtml +
      `</div>`,
    fromName: storeName,
  })
}

function formatArs(value: number | null): string {
  if (value == null) return "-"
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(value)
}

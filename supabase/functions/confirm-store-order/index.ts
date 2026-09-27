// Edge Function: confirm-store-order
// Confirma a mano un pedido pending (WhatsApp o transferencia -- Mercado Pago se confirma solo
// vía mercadopago-webhook, nunca por acá). Antes esto era un .rpc() directo desde ecomerse; pasa
// a vivir acá porque ahora, si el pedido tiene email de cliente, hace falta mandarle un aviso de
// "confirmamos tu pago" -- necesita el secret de SMTP, que ecomerse no tiene.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2"
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

    // Cliente de SESIÓN (no service-role): confirm_store_order deriva confirmed_by de
    // auth.uid() y valida que el pedido sea de la organización del usuario logueado -- mismo
    // comportamiento que cuando esto era un .rpc() directo desde ecomerse.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { storeOrderId } = await req.json()
    if (!storeOrderId) return errorResponse("Falta storeOrderId")

    const { error } = await supabase.rpc("confirm_store_order", { p_store_order_id: storeOrderId })
    if (error) return errorResponse(error.message, 400)

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    // Best-effort: el pedido ya quedó confirmado (stock descontado, venta creada) antes de
    // llegar acá -- que el email falle no puede revertir nada de eso.
    await sendPaymentConfirmedEmail(adminSupabase, storeOrderId).catch((err) =>
      console.error("confirm-store-order: sendPaymentConfirmedEmail falló", storeOrderId, err),
    )

    return jsonResponse({ ok: true })
  } catch (err: any) {
    console.error("confirm-store-order error:", err)
    return errorResponse(err.message || "Error interno", 500)
  }
})

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

async function sendPaymentConfirmedEmail(adminSupabase: SupabaseClient, storeOrderId: string): Promise<void> {
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
    `<tr><td style="padding:8px 8px 0 0; font-weight:bold;">Total</td>` +
    `<td style="padding:8px 0 0; text-align:right; font-weight:bold;">${formatArs(order.total)}</td></tr>`
  const linkHtml = orderUrl ? `<p><a href="${orderUrl}">Ver el detalle del pedido</a></p>` : ""

  await sendEmail({
    to: order.customer_email,
    subject: `Confirmamos tu pago — pedido #${order.order_number}`,
    html:
      `<div style="font-family:sans-serif;">` +
      `<p style="color:#6b6b6b;">Pedido #${order.order_number}</p>` +
      `<h2>¡Recibimos tu pago!</h2>` +
      `<p>Ya confirmamos tu pedido en ${storeName}:</p>` +
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

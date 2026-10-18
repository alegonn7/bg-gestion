// Edge Function: aviso-pedido-nuevo
// Le manda al dueño/admin de la tienda un mail "Tenés un pedido nuevo" cuando entra un pedido por
// WhatsApp o por transferencia (los de Mercado Pago ya avisan desde mercadopago-webhook al
// aprobarse el pago). La llama bg-tienda justo después de crear el pedido, con el cliente anon
// del visitante -- por eso no confía en nada más que el id: solo avisa pedidos recién creados,
// todavía pendientes y no avisados, y marca owner_notified_at para que sea un mail por pedido.

import { createClient } from "npm:@supabase/supabase-js@2"
import { sendEmail } from "../_shared/email.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// Margen para que la llamada llegue después del insert; pasado esto el id ya no sirve para avisar.
const VENTANA_MINUTOS = 15

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const { storeOrderId } = await req.json().catch(() => ({}))
    if (!storeOrderId || typeof storeOrderId !== "string") return jsonResponse({ ok: false, error: "Falta storeOrderId" }, 400)

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    // Reclamo atómico: si dos llamadas llegan juntas, solo una actualiza la fila y manda el mail.
    const desde = new Date(Date.now() - VENTANA_MINUTOS * 60_000).toISOString()
    const { data: claimed, error: claimError } = await adminSupabase
      .from("store_orders")
      .update({ owner_notified_at: new Date().toISOString() })
      .eq("id", storeOrderId)
      .eq("status", "pending")
      .in("payment_method", ["whatsapp", "transfer"])
      .is("owner_notified_at", null)
      .gte("created_at", desde)
      .select("id")

    if (claimError) {
      console.error("aviso-pedido-nuevo: no se pudo marcar el pedido", storeOrderId, claimError.message)
      return jsonResponse({ ok: false, error: "No se pudo procesar el aviso" }, 500)
    }
    if (!claimed?.length) return jsonResponse({ ok: true, sent: false })

    const { data: order } = await adminSupabase
      .from("store_orders")
      .select("*, store_order_items(*), organizations(slug, name)")
      .eq("id", storeOrderId)
      .single()
    if (!order) return jsonResponse({ ok: true, sent: false })

    const org = order.organizations as { slug: string; name: string } | null
    const storeName = org?.name ?? "tu tienda"
    const siteUrl = Deno.env.get("ECOMERSE_SITE_URL")
    const pedidosUrl = siteUrl ? `${siteUrl}/admin/pedidos` : null
    const esTransferencia = order.payment_method === "transfer"

    // Los pedidos por WhatsApp no guardan precio (el precio se arregla por chat), así que la
    // fila muestra el monto solo si existe.
    const itemsHtml = ((order.store_order_items ?? []) as any[])
      .map(
        (item) =>
          `<tr><td style="padding:4px 8px 4px 0;">${escapeHtml(item.product_name)}${item.size ? ` (${escapeHtml(item.size)})` : ""} × ${item.quantity}</td>` +
          `<td style="padding:4px 0; text-align:right; white-space:nowrap;">${item.subtotal != null ? formatArs(item.subtotal) : ""}</td></tr>`,
      )
      .join("")
    const totalRow =
      order.total != null
        ? `<tr><td style="padding:8px 8px 0 0; font-weight:bold;">Total</td>` +
          `<td style="padding:8px 0 0; text-align:right; font-weight:bold;">${formatArs(order.total)}</td></tr>`
        : ""

    const deliveryHtml =
      order.delivery_method === "shipping"
        ? `<p><strong>Envío a:</strong> ${escapeHtml(order.shipping_street ?? "")} ${escapeHtml(order.shipping_number ?? "")}` +
          `${order.shipping_floor_apartment ? `, ${escapeHtml(order.shipping_floor_apartment)}` : ""}, ` +
          `${escapeHtml(order.shipping_city ?? "")}, ${escapeHtml(order.shipping_province ?? "")} (CP ${escapeHtml(order.shipping_postal_code ?? "")})</p>`
        : esTransferencia
          ? `<p><strong>Entrega:</strong> retira en el local</p>`
          : ""
    const contacto = [order.customer_name, order.customer_phone, order.customer_email].filter(Boolean).map((v) => escapeHtml(String(v)))
    const contactHtml = contacto.length ? `<p><strong>Contacto:</strong> ${contacto.join(" — ")}</p>` : ""
    const noteHtml = order.customer_note ? `<p><strong>Nota del cliente:</strong> ${escapeHtml(order.customer_note)}</p>` : ""
    const introHtml = esTransferencia
      ? `<h2>Tenés un pedido nuevo</h2><p>Entró un pedido para pagar por <strong>transferencia</strong> en ${escapeHtml(storeName)}. ` +
        `Cuando veas la plata en tu cuenta, confirmalo desde Pedidos.</p>`
      : `<h2>Tenés un pedido nuevo</h2><p>Un cliente armó este pedido en ${escapeHtml(storeName)} y te va a escribir por <strong>WhatsApp</strong> para cerrarlo.</p>`
    const linkHtml = pedidosUrl ? `<p><a href="${pedidosUrl}">Ver el pedido en Pedidos</a></p>` : ""

    const html =
      `<div style="font-family:sans-serif;">` +
      `<p style="color:#6b6b6b;">Pedido #${order.order_number}</p>` +
      introHtml +
      `<table style="border-collapse:collapse; width:100%; max-width:480px;">${itemsHtml}${totalRow}</table>` +
      deliveryHtml +
      contactHtml +
      noteHtml +
      linkHtml +
      `</div>`

    const { data: staff } = await adminSupabase
      .from("users")
      .select("auth_id")
      .eq("organization_id", order.organization_id)
      .in("role", ["owner", "admin"])

    for (const row of (staff ?? []) as { auth_id: string }[]) {
      const { data: authUser } = await adminSupabase.auth.admin.getUserById(row.auth_id)
      const email = authUser?.user?.email
      if (!email) continue
      await sendEmail({
        to: email,
        subject: `Nuevo pedido #${order.order_number} en ${storeName}${esTransferencia ? " (transferencia)" : " (WhatsApp)"}`,
        html,
        fromName: "BG Tienda",
      })
    }

    return jsonResponse({ ok: true, sent: true })
  } catch (err: any) {
    console.error("aviso-pedido-nuevo error:", err)
    return jsonResponse({ ok: false, error: "Error interno" }, 500)
  }
})

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function formatArs(value: number | null): string {
  if (value == null) return "-"
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(value)
}

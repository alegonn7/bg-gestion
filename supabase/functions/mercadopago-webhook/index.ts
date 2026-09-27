// Edge Function: mercadopago-webhook
// Recibe las notificaciones de pago de Mercado Pago. Público, sin Authorization de usuario --
// lo llama el servidor de Mercado Pago directo. Responde recién después de procesar (no
// waitUntil): todo este trabajo (firma + 1 fetch a MP + 1 RPC) entra cómodo en el presupuesto
// de ack de Mercado Pago, y devolver 200 antes de procesar renunciaría a su reintento
// automático como red de seguridad si algo falla.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2"
import { hmacSha256Hex } from "../_shared/crypto.ts"
import { sendEmail } from "../_shared/email.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const url = new URL(req.url)
    const body = await req.json().catch(() => ({}) as any)
    const type = body?.type ?? url.searchParams.get("type")
    const dataId = body?.data?.id ?? url.searchParams.get("data.id")

    if (type !== "payment" || !dataId) {
      return jsonResponse({ ok: true }) // otros tópicos que MP puede mandar -- ignorar
    }

    // Validar firma ANTES de tocar cualquier dato. Manifest exacto del esquema oficial de MP:
    // "id:{data.id};request-id:{x-request-id};ts:{ts};" firmado con HMAC-SHA256.
    const secret = Deno.env.get("MP_WEBHOOK_SECRET")
    if (!(await isValidSignature(req, String(dataId), secret))) {
      return errorResponse("Firma inválida", 401)
    }

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    // Nunca confiar en montos/estado del body del webhook -- solo en esta consulta, con el
    // token de la PLATAFORMA (funciona para pagos hechos a través de vendedores conectados).
    const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
      headers: { Authorization: `Bearer ${Deno.env.get("MP_PLATFORM_ACCESS_TOKEN")}` },
    })
    const payment = await paymentResponse.json().catch(() => null)

    if (!paymentResponse.ok || !payment) {
      return errorResponse("No se pudo consultar el pago en Mercado Pago", 500)
    }

    const storeOrderId = payment.external_reference
    if (!storeOrderId) return jsonResponse({ ok: true }) // no es un pago nuestro

    if (payment.status === "approved") {
      const { error } = await adminSupabase.rpc("confirm_store_order_paid", {
        p_store_order_id: storeOrderId,
        p_mp_payment_id: String(payment.id),
        p_mp_status: payment.status,
      })

      if (error) {
        if (error.message?.includes("store_order_not_pending")) {
          return jsonResponse({ ok: true }) // reintento de MP para un pago ya procesado
        }
        if (error.message?.includes("insufficient_stock") || error.message?.includes("product_not_found")) {
          // Pagado pero sin stock -- condición de carrera real. No se auto-reembolsa (los
          // reembolsos split no se pueden probar en sandbox): queda pending con mp_status
          // grabado, requiere atención manual desde /admin/pedidos. Antes esto solo quedaba
          // como un badge pasivo en esa lista -- ahora además avisa por email para que no
          // dependa de que alguien entre a mirar.
          console.error("mercadopago-webhook: pagado sin stock", storeOrderId, error.message)
          await adminSupabase
            .from("store_orders")
            .update({ mp_payment_id: String(payment.id), mp_status: payment.status })
            .eq("id", storeOrderId)
            .eq("status", "pending")
          await sendPaymentWithoutStockAlert(adminSupabase, storeOrderId)
          return jsonResponse({ ok: true })
        }
        return errorResponse(error.message, 500) // MP reintenta
      }

      // Guardar el desglose de aranceles que cobra Mercado Pago (distinto de la comisión de
      // la plataforma, que ya vive en mp_fee_amount) -- hoy no había ningún registro de esto
      // en el sistema, solo visible entrando a la cuenta de Mercado Pago directo. Best-effort.
      if (payment.fee_details) {
        const { error: feeErr } = await adminSupabase
          .from("store_orders")
          .update({ mp_fee_details: payment.fee_details })
          .eq("id", storeOrderId)
        if (feeErr) console.error("mercadopago-webhook: no se pudo guardar mp_fee_details", storeOrderId, feeErr)
      }

      // Pago confirmado -- mandar los emails de confirmación. Best-effort a propósito: nunca
      // debe bloquear ni hacer fallar el 200 OK que este webhook le debe a Mercado Pago (un
      // fallo acá ya no tiene nada que ver con si el pedido se confirmó o no).
      await sendOrderConfirmationEmails(adminSupabase, storeOrderId)
    } else if (payment.status === "rejected" || payment.status === "cancelled") {
      const { error } = await adminSupabase.rpc("cancel_store_order_payment_failed", {
        p_store_order_id: storeOrderId,
        p_mp_payment_id: String(payment.id),
        p_mp_status: payment.status,
      })
      if (error && !error.message?.includes("store_order_not_found")) {
        return errorResponse(error.message, 500)
      }
    } else {
      // pending, in_process, etc. -- sin side-effects que proteger con lock, update directo.
      await adminSupabase
        .from("store_orders")
        .update({ mp_payment_id: String(payment.id), mp_status: payment.status })
        .eq("id", storeOrderId)
        .eq("status", "pending")
    }

    return jsonResponse({ ok: true })
  } catch (err: any) {
    console.error("mercadopago-webhook error:", err)
    return errorResponse(err.message || "Error interno", 500)
  }
})

async function isValidSignature(req: Request, dataId: string, secret: string | undefined): Promise<boolean> {
  if (!secret) return false // siempre requerido -- sin bypass de "modo dev sin secret"

  const xSignature = req.headers.get("x-signature") ?? ""
  const xRequestId = req.headers.get("x-request-id") ?? ""
  if (!xSignature || !xRequestId) return false

  let ts = ""
  let v1 = ""
  for (const part of xSignature.split(",")) {
    const [key, value] = part.split("=")
    if (key?.trim() === "ts") ts = value?.trim() ?? ""
    if (key?.trim() === "v1") v1 = value?.trim() ?? ""
  }
  if (!ts || !v1) return false

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`
  const expected = await hmacSha256Hex(manifest, secret)
  return expected === v1
}

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

// Un email al cliente (si dejó su email) y uno a cada owner/admin de la tienda -- ambos con el
// mismo detalle del pedido. Todo el bloque atrapado: ver el comentario en el call site, esto
// nunca debe poder hacer fallar la confirmación del pago en sí.
async function sendOrderConfirmationEmails(adminSupabase: SupabaseClient, storeOrderId: string): Promise<void> {
  try {
    const { data: order } = await adminSupabase
      .from("store_orders")
      .select("*, store_order_items(*), organizations(slug, name)")
      .eq("id", storeOrderId)
      .single()

    if (!order) return

    const org = order.organizations as { slug: string; name: string } | null
    const siteUrl = Deno.env.get("ECOMERSE_SITE_URL")
    const orderUrl = siteUrl && org?.slug ? `${siteUrl}/${org.slug}/pedido/${order.id}` : null
    const storeName = org?.name ?? "tu tienda"

    const itemsHtml = ((order.store_order_items ?? []) as any[])
      .map(
        (item) =>
          `<tr><td style="padding:4px 8px 4px 0;">${item.product_name}${item.size ? ` (${item.size})` : ""} × ${item.quantity}</td>` +
          `<td style="padding:4px 0; text-align:right; white-space:nowrap;">${formatArs(item.subtotal)}</td></tr>`,
      )
      .join("")
    const feeRow =
      order.mp_fee_amount > 0
        ? `<tr><td style="padding:4px 8px 4px 0; color:#6b6b6b;">Comisión de servicio</td>` +
          `<td style="padding:4px 0; text-align:right; color:#6b6b6b;">${formatArs(order.mp_fee_amount)}</td></tr>`
        : ""
    const shippingIsFree = order.shipping_original_cost != null && order.shipping_original_cost > (order.shipping_cost ?? 0)
    const shippingRow =
      order.delivery_method === "shipping"
        ? `<tr><td style="padding:4px 8px 4px 0; color:#6b6b6b;">Envío</td>` +
          `<td style="padding:4px 0; text-align:right; color:#6b6b6b;">` +
          (shippingIsFree
            ? `Gratis (cotizado ${formatArs(order.shipping_original_cost)})`
            : formatArs(order.shipping_cost)) +
          `</td></tr>`
        : ""
    const totalRow =
      `<tr><td style="padding:8px 8px 0 0; font-weight:bold;">Total</td>` +
      `<td style="padding:8px 0 0; text-align:right; font-weight:bold;">${formatArs(order.total)}</td></tr>`

    const deliveryHtml =
      order.delivery_method === "shipping"
        ? `<p><strong>Envío a:</strong> ${order.shipping_street ?? ""} ${order.shipping_number ?? ""}` +
          `${order.shipping_floor_apartment ? `, ${order.shipping_floor_apartment}` : ""}, ` +
          `${order.shipping_city ?? ""}, ${order.shipping_province ?? ""} (CP ${order.shipping_postal_code ?? ""})</p>`
        : `<p><strong>Entrega:</strong> retira en el local</p>`
    const contactHtml = order.customer_name
      ? `<p><strong>Contacto:</strong> ${order.customer_name}${order.customer_phone ? ` — ${order.customer_phone}` : ""}</p>`
      : ""
    const linkHtml = orderUrl ? `<p><a href="${orderUrl}">Ver el detalle del pedido</a></p>` : ""

    const bodyHtml = (intro: string, opts: { showContact: boolean }) =>
      `<div style="font-family:sans-serif;">` +
      `<p style="color:#6b6b6b;">Pedido #${order.order_number}</p>` +
      intro +
      `<table style="border-collapse:collapse; width:100%; max-width:480px;">${itemsHtml}${feeRow}${shippingRow}${totalRow}</table>` +
      deliveryHtml +
      (opts.showContact ? contactHtml : "") +
      linkHtml +
      `</div>`

    if (order.customer_email) {
      await sendEmail({
        to: order.customer_email,
        subject: `Pedido #${order.order_number} confirmado — ${storeName}`,
        html: bodyHtml(`<h2>¡Gracias por tu compra!</h2><p>Te confirmamos el pedido en ${storeName}:</p>`, {
          showContact: false,
        }),
        fromName: storeName,
      })
    }

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
        subject: `Nuevo pedido #${order.order_number} en ${storeName}`,
        html: bodyHtml(`<h2>Tenés un pedido nuevo</h2><p>Se acaba de confirmar este pago en ${storeName}:</p>`, {
          showContact: true,
        }),
        fromName: "BG Tienda",
      })
    }
  } catch (err) {
    console.error("mercadopago-webhook: sendOrderConfirmationEmails falló", storeOrderId, err)
  }
}

// Avisa a owner/admin que un pago se aprobó pero el pedido quedó "pending" por falta de stock
// (condición de carrera, ver call site) -- requiere revisar /admin/pedidos y decidir entre
// reponer stock + confirmar, o reembolsar. Best-effort, igual que sendOrderConfirmationEmails:
// nunca debe poder hacer fallar el 200 OK que este webhook le debe a Mercado Pago.
async function sendPaymentWithoutStockAlert(adminSupabase: SupabaseClient, storeOrderId: string): Promise<void> {
  try {
    const { data: order } = await adminSupabase
      .from("store_orders")
      .select("order_number, total, organization_id, organizations(slug, name)")
      .eq("id", storeOrderId)
      .single()

    if (!order) return

    const org = order.organizations as unknown as { slug: string; name: string } | null
    const siteUrl = Deno.env.get("ECOMERSE_SITE_URL")
    const pedidosUrl = siteUrl && org?.slug ? `${siteUrl}/${org.slug}/admin/pedidos` : null
    const storeName = org?.name ?? "tu tienda"

    const { data: staff } = await adminSupabase
      .from("users")
      .select("auth_id")
      .eq("organization_id", order.organization_id)
      .in("role", ["owner", "admin"])

    const html =
      `<div style="font-family:sans-serif;">` +
      `<h2>⚠️ Pago aprobado sin stock disponible</h2>` +
      `<p>Un cliente pagó el pedido #${order.order_number} (${formatArs(order.total)}) en ${storeName}, ` +
      `pero al momento de confirmarlo ya no había stock suficiente. El pedido quedó pendiente y ` +
      `<strong>no se reembolsó automáticamente</strong> -- hace falta que lo revises a mano: ` +
      `reponer stock y confirmarlo, o reembolsar el pago.</p>` +
      (pedidosUrl ? `<p><a href="${pedidosUrl}">Ver el pedido en /admin/pedidos</a></p>` : "") +
      `</div>`

    for (const row of (staff ?? []) as { auth_id: string }[]) {
      const { data: authUser } = await adminSupabase.auth.admin.getUserById(row.auth_id)
      const email = authUser?.user?.email
      if (!email) continue
      await sendEmail({
        to: email,
        subject: `⚠️ Pedido #${order.order_number} pagado sin stock — requiere atención`,
        html,
        fromName: "BG Tienda",
      })
    }
  } catch (err) {
    console.error("mercadopago-webhook: sendPaymentWithoutStockAlert falló", storeOrderId, err)
  }
}

function formatArs(value: number | null): string {
  if (value == null) return "-"
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(value)
}

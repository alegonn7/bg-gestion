// Edge Function: mercadopago-checkout
// Crea la preference de Mercado Pago para un pedido online ya insertado (pending,
// payment_method='mercadopago'). Sin Authorization de usuario -- la llama el storefront
// anónimo. La autorización acá es de estado del objeto, mismo modelo de confianza que ya
// acepta la policy store_orders_public_insert hoy (cualquiera puede insertar un pedido pending
// sin probar identidad).
//
// Punto técnico central: marketplace_fee solo tiene efecto si la preference se crea con el
// access_token del VENDEDOR (obtenido por OAuth), nunca con el de la plataforma -- por eso
// getValidSellerAccessToken(organizationId), no un token fijo de plataforma.

import { createClient } from "npm:@supabase/supabase-js@2"
import { getValidSellerAccessToken, MercadoPagoNotConnectedError } from "../_shared/mercadopago.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const { storeOrderId, slug } = await req.json()
    if (!storeOrderId) return errorResponse("Falta storeOrderId")

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    const { data: order } = await adminSupabase
      .from("store_orders")
      .select("*, store_order_items(*)")
      .eq("id", storeOrderId)
      .maybeSingle()

    if (!order) return errorResponse("Pedido no encontrado", 404)
    if (order.status !== "pending") return errorResponse("Este pedido ya no está pendiente")
    if (order.payment_method !== "mercadopago") return errorResponse("Este pedido no es de Mercado Pago")
    if (!order.store_order_items?.length) return errorResponse("El pedido no tiene items")

    const { data: settings } = await adminSupabase
      .from("store_settings")
      .select("payment_online_enabled")
      .eq("organization_id", order.organization_id)
      .single()

    if (!settings?.payment_online_enabled) {
      return errorResponse("Esta tienda no tiene pago online habilitado")
    }

    // Chequeo de stock best-effort (no es un lock -- solo evita el caso común de pagar algo
    // que ya no hay). La condición de carrera real (alguien más compra el último ítem entre
    // este chequeo y que el pago se confirme) la maneja el webhook, ver notas ahí.
    for (const item of order.store_order_items) {
      const { data: pb } = await adminSupabase
        .from("products_branch")
        .select("stock_quantity")
        .eq("product_id", item.product_id)
        .eq("branch_id", order.branch_id)
        .maybeSingle()

      if (!pb || pb.stock_quantity < item.quantity) {
        return errorResponse(`Sin stock suficiente: ${item.product_name}`)
      }
    }

    // unit_price/subtotal de store_order_items ya se calcularon server-side contra el precio
    // real al insertar el pedido (createMercadoPagoCheckout en ecomerse) -- y anon no tiene
    // ninguna policy de UPDATE sobre store_order_items, así que no pueden haber sido
        // manipulados después. No hace falta recalcularlos de nuevo acá.
    const subtotal = order.store_order_items.reduce((sum: number, i: any) => sum + Number(i.subtotal ?? 0), 0)
    // Comisión fija de la plataforma -- nunca la elige la tienda (no hay ningún input para esto
    // en el admin). MP_PLATFORM_FEE_PERCENTAGE vive solo como secret de esta Edge Function.
    const feePercentage = Number(Deno.env.get("MP_PLATFORM_FEE_PERCENTAGE") ?? "1")
    const feeAmount = Math.round(subtotal * feePercentage) / 100
    // shipping_cost ya viene resuelto de forma autoritativa (createMercadoPagoCheckout llamó a
    // shipping-quote server-to-server antes de esto) -- acá solo se suma, nunca se recalcula.
    const shippingCost = Number(order.shipping_cost ?? 0)
    // La comisión de la PLATAFORMA la paga el cliente, sumada al total -- se muestra como ítem
    // aparte del carrito de Mercado Pago (más abajo) y ADEMÁS se declara como marketplace_fee,
    // que es lo que hace que Mercado Pago la retenga y la acredite a la plataforma en vez de al
    // vendedor. El costo PROPIO de Mercado Pago (su arancel de siempre) lo sigue absorbiendo la
    // tienda como cualquier cobro con MP -- eso no es algo que podamos redirigir.
    const total = subtotal + feeAmount + shippingCost

    await adminSupabase
      .from("store_orders")
      .update({ subtotal, total, mp_fee_amount: feeAmount, updated_at: new Date().toISOString() })
      .eq("id", storeOrderId)

    let sellerAccessToken: string
    try {
      sellerAccessToken = await getValidSellerAccessToken(adminSupabase, order.organization_id)
    } catch (err) {
      if (err instanceof MercadoPagoNotConnectedError) {
        return errorResponse("Esta tienda no conectó Mercado Pago")
      }
      throw err
    }

    const { data: creds } = await adminSupabase
      .from("store_mercadopago_credentials")
      .select("live_mode")
      .eq("organization_id", order.organization_id)
      .single()

    const items = order.store_order_items.map((item: any) => ({
      title: item.product_name + (item.size ? ` (${item.size})` : ""),
      quantity: item.quantity,
      unit_price: Number(item.unit_price ?? 0),
      currency_id: "ARS",
    }))

    // Comisión de la plataforma, visible como ítem propio del carrito -- ver nota junto a
    // "total" más arriba.
    if (feeAmount > 0) {
      items.push({ title: "Comisión de servicio", quantity: 1, unit_price: feeAmount, currency_id: "ARS" })
    }

    // El envío nunca es una fila de store_order_items (rompería
    // confirm_store_order_paid, que busca products_branch por product_id) -- vive en la columna
    // dedicada shipping_cost y se inyecta como línea sintética solo acá.
    if (shippingCost > 0) {
      items.push({ title: "Envío a domicilio", quantity: 1, unit_price: shippingCost, currency_id: "ARS" })
    }

    const siteUrl = Deno.env.get("ECOMERSE_SITE_URL")
    // Apunta a la pantalla de detalle del pedido (no a la home) -- get_public_store_order la
    // resuelve por el id, autorizado por posesión del UUID, no por sesión.
    const returnUrl = siteUrl && slug ? `${siteUrl}/${slug}/pedido/${storeOrderId}` : undefined

    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${sellerAccessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        items,
        marketplace_fee: feeAmount,
        external_reference: storeOrderId,
        notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`,
        ...(order.customer_email ? { payer: { email: order.customer_email } } : {}),
        ...(returnUrl ? { back_urls: { success: returnUrl, failure: returnUrl, pending: returnUrl }, auto_return: "approved" } : {}),
        statement_descriptor: "bg-tienda",
      }),
    })

    const preference = await mpResponse.json().catch(() => null)
    if (!mpResponse.ok || !preference?.id) {
      return errorResponse(`No se pudo crear el pago en Mercado Pago: ${JSON.stringify(preference)}`, 500)
    }

    await adminSupabase.from("store_orders").update({ mp_preference_id: preference.id }).eq("id", storeOrderId)

    const checkoutUrl = creds?.live_mode === false ? preference.sandbox_init_point : preference.init_point

    return jsonResponse({ ok: true, checkoutUrl })
  } catch (err: any) {
    console.error("mercadopago-checkout error:", err)
    return errorResponse(err.message || "Error interno", 500)
  }
})

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

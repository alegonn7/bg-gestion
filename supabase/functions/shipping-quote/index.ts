// Edge Function: shipping-quote
// Cotiza el costo de envío para un carrito. Dos modos posibles según
// store_settings.shipping_pricing_mode: "carrier" delega al transportista real que la tienda
// conectó (Correo Argentino/Andreani, necesita credenciales propias); "fixed_zones" es un monto
// fijo por provincia que la tienda define a mano, sin transportista ni credenciales -- para
// quien no quiere lidiar con eso. Pública, sin Authorization de usuario -- la llama el
// storefront anónimo (mismo modelo de confianza que mercadopago-checkout: cualquiera puede
// pedir una cotización, no hay nada sensible en el resultado). Se usa dos veces: preview
// interactivo desde /[slug]/checkout, y recotización autoritativa desde
// createMercadoPagoCheckout justo antes de cobrar -- nunca se confía en un costo que ya vino
// calculado del navegador.

import { createClient } from "npm:@supabase/supabase-js@2"
import { decryptSecret } from "../_shared/crypto.ts"
import * as correoArgentino from "../_shared/carriers/correo-argentino.ts"
import * as andreani from "../_shared/carriers/andreani.ts"
import type { QuoteInput } from "../_shared/carriers/types.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// Defaults de plataforma cuando ni el producto ni la tienda cargaron peso/dimensiones -- nunca
// bloquea la cotización por falta de datos (paquete chico genérico). Solo aplica al modo "carrier".
const DEFAULT_WEIGHT_GRAMS = 500
const DEFAULT_LENGTH_CM = 20
const DEFAULT_WIDTH_CM = 15
const DEFAULT_HEIGHT_CM = 10

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const { organizationId, destinationPostalCode, destinationProvince, items } = await req.json()
    if (!organizationId || !destinationPostalCode || !Array.isArray(items) || !items.length) {
      return errorResponse("Faltan datos para cotizar el envío")
    }

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    const { data: settings } = await adminSupabase
      .from("store_settings")
      .select(
        "branch_id, shipping_enabled, shipping_pricing_mode, shipping_carrier, shipping_default_weight_grams, shipping_default_length_cm, shipping_default_width_cm, shipping_default_height_cm, free_shipping_threshold, fixed_shipping_default_cost, fixed_shipping_zones",
      )
      .eq("organization_id", organizationId)
      .single()

    if (!settings?.shipping_enabled) {
      return errorResponse("Esta tienda no tiene envío calculado habilitado")
    }

    // Envío gratis a partir de un subtotal configurable por tienda (free_shipping_threshold,
    // NULL = nunca gratis) -- compartido por los dos modos, se calcula una sola vez acá.
    const { data: catalogRows } = await adminSupabase
      .from("store_catalog")
      .select("product_id, price_sale")
      .eq("branch_id", settings.branch_id)
      .in("product_id", items.map((i: { productId: string }) => i.productId))

    const priceByProduct = new Map((catalogRows ?? []).map((row) => [row.product_id, Number(row.price_sale ?? 0)]))
    const subtotal = (items as { productId: string; quantity: number }[]).reduce(
      (sum, item) => sum + (priceByProduct.get(item.productId) ?? 0) * item.quantity,
      0,
    )
    const threshold = settings.free_shipping_threshold != null ? Number(settings.free_shipping_threshold) : null
    const isFree = threshold != null && subtotal >= threshold

    if (settings.shipping_pricing_mode === "fixed_zones") {
      if (!destinationProvince) return errorResponse("Falta la provincia de destino")

      const zones = (settings.fixed_shipping_zones ?? []) as { province: string; cost: number }[]
      const zoneMatch = zones.find((z) => z.province === destinationProvince)
      const rawCost = zoneMatch
        ? Number(zoneMatch.cost)
        : settings.fixed_shipping_default_cost != null
          ? Number(settings.fixed_shipping_default_cost)
          : null

      if (rawCost == null) return errorResponse("Esta tienda no hace envíos a tu provincia")

      return jsonResponse({
        ok: true,
        cost: isFree ? 0 : rawCost,
        originalCost: rawCost,
        isFree,
        estimatedDays: null,
        quoteReference: null,
        usedDefaultDimensions: false,
      })
    }

    // Modo "carrier": comportamiento original, delega en Correo Argentino/Andreani.
    if (!settings.shipping_carrier) {
      return errorResponse("Esta tienda no tiene envío calculado habilitado")
    }

    const { data: branch } = await adminSupabase
      .from("branches")
      .select("shipping_origin_postal_code")
      .eq("id", settings.branch_id)
      .single()

    if (!branch?.shipping_origin_postal_code) {
      return errorResponse("La tienda no configuró su código postal de origen")
    }

    const { data: creds } = await adminSupabase
      .from("store_shipping_credentials")
      .select("credentials_encrypted, environment")
      .eq("organization_id", organizationId)
      .eq("carrier", settings.shipping_carrier)
      .maybeSingle()

    if (!creds) {
      return errorResponse("Esta tienda no conectó su transportista")
    }

    const encryptionKey = Deno.env.get("SHIPPING_CREDENTIALS_ENCRYPTION_KEY")!
    const credentials = JSON.parse(await decryptSecret(creds.credentials_encrypted, encryptionKey))

    const { data: products } = await adminSupabase
      .from("products")
      .select("id, weight_grams, length_cm, width_cm, height_cm")
      .in("id", items.map((i: { productId: string }) => i.productId))

    const productById = new Map((products ?? []).map((p) => [p.id, p]))

    // Contenedor virtual: peso total sumado, largo/ancho máximo entre ítems, alto sumado --
    // simplificación de v1, no arma múltiples bultos para carritos grandes.
    let usedDefaultDimensions = false
    let totalWeightGrams = 0
    let maxLengthCm = 0
    let maxWidthCm = 0
    let totalHeightCm = 0

    for (const item of items as { productId: string; quantity: number }[]) {
      const p = productById.get(item.productId)
      const weight = p?.weight_grams ?? settings.shipping_default_weight_grams ?? DEFAULT_WEIGHT_GRAMS
      const length = p?.length_cm ?? settings.shipping_default_length_cm ?? DEFAULT_LENGTH_CM
      const width = p?.width_cm ?? settings.shipping_default_width_cm ?? DEFAULT_WIDTH_CM
      const height = p?.height_cm ?? settings.shipping_default_height_cm ?? DEFAULT_HEIGHT_CM
      if (!p?.weight_grams || !p?.length_cm || !p?.width_cm || !p?.height_cm) usedDefaultDimensions = true

      totalWeightGrams += weight * item.quantity
      maxLengthCm = Math.max(maxLengthCm, length)
      maxWidthCm = Math.max(maxWidthCm, width)
      totalHeightCm += height * item.quantity
    }

    const quoteInput: QuoteInput = {
      originPostalCode: branch.shipping_origin_postal_code,
      destinationPostalCode,
      weightGrams: totalWeightGrams,
      lengthCm: maxLengthCm,
      widthCm: maxWidthCm,
      heightCm: totalHeightCm,
    }

    // Ecomerse nunca decide con qué transportista hablar -- es un detalle server-side, igual
    // que mercadopago-checkout ya decide sola live_mode.
    const carrierModule = settings.shipping_carrier === "andreani" ? andreani : correoArgentino
    const result = await carrierModule.quote(credentials, creds.environment, quoteInput)

    return jsonResponse({
      ok: true,
      cost: isFree ? 0 : result.cost,
      originalCost: result.cost,
      isFree,
      estimatedDays: result.estimatedDays,
      quoteReference: result.quoteReference,
      usedDefaultDimensions,
    })
  } catch (err: any) {
    console.error("shipping-quote error:", err)
    return errorResponse(err.message || "Error interno", 500)
  }
})

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

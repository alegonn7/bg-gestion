// Edge Function: fiscal-emit
// Emite comprobantes usando el certificado compartido del desarrollador

import { createClient } from "npm:@supabase/supabase-js@2"
import {
  getWSAAToken,
  autorizarComprobante,
  consultarUltimoNumero,
  type InvoiceRequest,
  type WSAACredentials,
} from "../_shared/afip.ts"

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
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return errorResponse("No autorizado", 401)

    const { data: dbUser } = await supabase
      .from("users")
      .select("organization_id")
      .eq("auth_id", user.id)
      .single()

    if (!dbUser) return errorResponse("Usuario no encontrado", 404)

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    // Cargar configuración fiscal del cliente
    const { data: org } = await adminSupabase
      .from("organizations")
      .select("id, cuit, razon_social, condicion_iva, punto_venta, actividad_afip, fiscal_enabled")
      .eq("id", dbUser.organization_id)
      .single()

    if (!org?.fiscal_enabled) return errorResponse("Facturación electrónica no configurada")
    if (!org.cuit) return errorResponse("CUIT no configurado")

    // Cargar certificado compartido del desarrollador desde env vars
    const certPem = Deno.env.get("FISCAL_CERT_PEM")
    const keyPem = Deno.env.get("FISCAL_KEY_PEM")
    if (!certPem || !keyPem) {
      return errorResponse("Certificado del sistema no configurado. Contactá al soporte.", 500)
    }

    const body = await req.json()
    const { invoiceRequest, saleId, originalComprobanteId }: {
      invoiceRequest: InvoiceRequest
      saleId?: string
      originalComprobanteId?: string
    } = body

    // ── 1. Obtener token WSAA (caché global compartido) ───────────────────────
    let credentials: WSAACredentials

    const { data: cache } = await adminSupabase
      .from("fiscal_wsaa_cache")
      .select("wsaa_token, wsaa_sign, wsaa_token_expires")
      .eq("id", 1)
      .single()

    const tokenExpires = cache?.wsaa_token_expires ? new Date(cache.wsaa_token_expires) : null
    const tokenValid = tokenExpires && tokenExpires.getTime() - Date.now() > 30 * 60 * 1000

    if (tokenValid && cache?.wsaa_token && cache?.wsaa_sign) {
      credentials = {
        token: cache.wsaa_token,
        sign: cache.wsaa_sign,
        expires: tokenExpires!,
      }
    } else {
      // Pedir nuevo token con el certificado del desarrollador
      credentials = await getWSAAToken(certPem, keyPem)

      await adminSupabase
        .from("fiscal_wsaa_cache")
        .upsert({
          id: 1,
          wsaa_token: credentials.token,
          wsaa_sign: credentials.sign,
          wsaa_token_expires: credentials.expires.toISOString(),
        })
    }

    // ── 2. Consultar último número (usando CUIT del cliente como representado) ─
    const ultimoNumero = await consultarUltimoNumero(
      credentials,
      org.cuit,
      invoiceRequest.tipoComprobante,
      invoiceRequest.puntoVenta
    )

    // ── 3. Emitir comprobante a nombre del cliente ─────────────────────────────
    const rawRequest = { ...invoiceRequest, ultimoNumero }
    let rawResponse: object = {}
    let result

    try {
      result = await autorizarComprobante(
        credentials,
        org.cuit,   // cuitRepresentada = CUIT del cliente
        invoiceRequest,
        ultimoNumero
      )
      rawResponse = result
    } catch (afipError: any) {
      await adminSupabase.from("fiscal_comprobantes").insert({
        organization_id: org.id,
        sale_id: saleId || null,
        tipo_cbte: invoiceRequest.tipoComprobante,
        punto_venta: invoiceRequest.puntoVenta,
        numero: ultimoNumero + 1,
        fecha_emision: invoiceRequest.fechaEmision,
        cuit_receptor: invoiceRequest.cuitReceptor || null,
        importe_total: invoiceRequest.items.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0),
        resultado: "R",
        raw_request: rawRequest,
        raw_response: { error: afipError.message },
      })
      return errorResponse(afipError.message)
    }

    // ── 4. Guardar en DB ───────────────────────────────────────────────────────
    const totales = invoiceRequest.items.reduce(
      (acc, item) => {
        acc.subtotal += item.precioUnitario * item.cantidad
        acc.iva += item.importeIVA * item.cantidad
        return acc
      },
      { subtotal: 0, iva: 0 }
    )

    await adminSupabase.from("fiscal_comprobantes").insert({
      organization_id: org.id,
      sale_id: saleId || null,
      original_comprobante_id: originalComprobanteId || null,
      tipo_cbte: invoiceRequest.tipoComprobante,
      punto_venta: invoiceRequest.puntoVenta,
      numero: result.numero,
      fecha_emision: invoiceRequest.fechaEmision,
      cuit_receptor: invoiceRequest.cuitReceptor || null,
      razon_social_receptor: invoiceRequest.razonSocialReceptor || null,
      condicion_iva_receptor: invoiceRequest.condicionIVAReceptor,
      importe_neto: totales.subtotal,
      importe_iva: totales.iva,
      importe_total: totales.subtotal + totales.iva,
      cae: result.cae,
      cae_vence: result.caeVence,
      resultado: result.resultado,
      observaciones: result.observaciones?.length ? result.observaciones : null,
      raw_request: rawRequest,
      raw_response: rawResponse,
    })

    return jsonResponse({
      ok: true,
      cae: result.cae,
      caeVence: result.caeVence,
      numero: result.numero,
      resultado: result.resultado,
      observaciones: result.observaciones,
    })

  } catch (err: any) {
    console.error("fiscal-emit error:", err)
    return errorResponse(err.message || "Error interno", 500)
  }
})

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

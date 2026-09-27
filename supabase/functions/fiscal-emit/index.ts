// Edge Function: fiscal-emit
// Emite comprobantes usando el certificado compartido del desarrollador

import { createClient } from "npm:@supabase/supabase-js@2"
import {
  getWSAAToken,
  autorizarComprobante,
  consultarUltimoNumero,
  logWSAATokenRelations,
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
    const certPemRaw = Deno.env.get("FISCAL_CERT_PEM")
    const keyPemRaw = Deno.env.get("FISCAL_KEY_PEM")
    if (!certPemRaw || !keyPemRaw) {
      return errorResponse("Certificado del sistema no configurado. Contactá al soporte.", 500)
    }
    // Supabase puede guardar los saltos de línea como \n literal
    const certPem = certPemRaw.replace(/\\n/g, '\n')
    const keyPem = keyPemRaw.replace(/\\n/g, '\n')

    const body = await req.json()
    const { invoiceRequest, saleId, originalComprobanteId }: {
      invoiceRequest: InvoiceRequest
      saleId?: string
      originalComprobanteId?: string
    } = body

    // ── 1. Obtener token WSAA (caché global compartido) ───────────────────────
    const loadCredentials = async (forceRefresh = false): Promise<WSAACredentials> => {
      if (!forceRefresh) {
        const { data: cache } = await adminSupabase
          .from("fiscal_wsaa_cache")
          .select("wsaa_token, wsaa_sign, wsaa_token_expires")
          .eq("id", 1)
          .single()

        const tokenExpires = cache?.wsaa_token_expires ? new Date(cache.wsaa_token_expires) : null
        const tokenValid = tokenExpires && tokenExpires.getTime() - Date.now() > 30 * 60 * 1000

        if (tokenValid && cache?.wsaa_token && cache?.wsaa_sign) {
          logWSAATokenRelations(cache.wsaa_token)
          return { token: cache.wsaa_token, sign: cache.wsaa_sign, expires: tokenExpires! }
        }
      }

      const fresh = await getWSAAToken(certPem, keyPem)
      await adminSupabase
        .from("fiscal_wsaa_cache")
        .upsert({
          id: 1,
          wsaa_token: fresh.token,
          wsaa_sign: fresh.sign,
          wsaa_token_expires: fresh.expires.toISOString(),
        })
      return fresh
    }

    let credentials: WSAACredentials = await loadCredentials()

    // ── DIAGNÓSTICO: verificar si wsfe funciona con el CUIT del desarrollador ──
    const devCuit = Deno.env.get("FISCAL_DEVELOPER_CUIT")
    if (devCuit) {
      try {
        await consultarUltimoNumero(credentials, devCuit, invoiceRequest.tipoComprobante, invoiceRequest.puntoVenta)
        console.log("[DIAG] wsfe con CUIT desarrollador OK — wsfe funciona para el desarrollador mismo")
      } catch (devErr: any) {
        console.log("[DIAG] wsfe con CUIT desarrollador ERROR:", devErr.message)
      }
    }

    // ── 2 + 3. Consultar último número y emitir (con retry si el token era stale) ─
    const rawRequest: Record<string, unknown> = { ...invoiceRequest }
    let rawResponse: object = {}
    let result
    let ultimoNumero: number

    const attemptEmision = async (creds: WSAACredentials) => {
      const ultimo = await consultarUltimoNumero(
        creds,
        org.cuit,
        invoiceRequest.tipoComprobante,
        invoiceRequest.puntoVenta
      )
      rawRequest.ultimoNumero = ultimo
      const res = await autorizarComprobante(creds, org.cuit, invoiceRequest, ultimo)
      return { res, ultimo }
    }

    try {
      const { res, ultimo } = await attemptEmision(credentials)
      result = res
      rawResponse = res
      ultimoNumero = ultimo
    } catch (afipError: any) {
      const isTokenRelationError = /ValidacionDeToken|lista de relaciones|no aparecio/i.test(afipError.message)
      if (isTokenRelationError) {
        console.log("[fiscal-emit] ValidacionDeToken — refrescando token WSAA y reintentando")
        credentials = await loadCredentials(true)
        try {
          const { res, ultimo } = await attemptEmision(credentials)
          result = res
          rawResponse = res
          ultimoNumero = ultimo
        } catch (retryError: any) {
          await adminSupabase.from("fiscal_comprobantes").insert({
            organization_id: org.id,
            sale_id: saleId || null,
            tipo_cbte: invoiceRequest.tipoComprobante,
            punto_venta: invoiceRequest.puntoVenta,
            numero: (rawRequest.ultimoNumero as number ?? 0) + 1,
            fecha_emision: invoiceRequest.fechaEmision,
            cuit_receptor: invoiceRequest.cuitReceptor || null,
            importe_total: invoiceRequest.items.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0),
            resultado: "R",
            raw_request: rawRequest,
            raw_response: { error: retryError.message },
          })
          return errorResponse(retryError.message)
        }
      } else {
        await adminSupabase.from("fiscal_comprobantes").insert({
          organization_id: org.id,
          sale_id: saleId || null,
          tipo_cbte: invoiceRequest.tipoComprobante,
          punto_venta: invoiceRequest.puntoVenta,
          numero: (rawRequest.ultimoNumero as number ?? 0) + 1,
          fecha_emision: invoiceRequest.fechaEmision,
          cuit_receptor: invoiceRequest.cuitReceptor || null,
          importe_total: invoiceRequest.items.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0),
          resultado: "R",
          raw_request: rawRequest,
          raw_response: { error: afipError.message },
        })
        return errorResponse(afipError.message)
      }
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

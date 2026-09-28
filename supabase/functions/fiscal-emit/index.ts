// Edge Function: fiscal-emit
// Emite facturas, notas de crédito y notas de débito con el certificado propio de la
// organización, a través de Afip SDK.

import { createClient } from "npm:@supabase/supabase-js@2"
import { type AfipSdk, type Ambiente, obtenerTicketAcceso } from "../_shared/afipsdk.ts"
import { decryptSecret } from "../_shared/crypto.ts"
import { type AuthWsfe, emitirComprobante, type InvoiceRequest, RechazoArca } from "../_shared/wsfe.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// El ticket de acceso de ARCA dura 12 hs; se renueva si le quedan menos de 10 minutos
const MARGEN_TICKET_MS = 10 * 60 * 1000

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

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const [{ data: org }, { data: cred }] = await Promise.all([
      admin.from("organizations").select("id, fiscal_enabled, punto_venta").eq("id", dbUser.organization_id).single(),
      admin.from("fiscal_credentials").select("*").eq("organization_id", dbUser.organization_id).maybeSingle(),
    ])
    if (!org?.fiscal_enabled || !cred?.activo) return errorResponse("Facturación electrónica no configurada")

    const { invoiceRequest, saleId, originalComprobanteId }: {
      invoiceRequest: InvoiceRequest
      saleId?: string
      originalComprobanteId?: string
    } = await req.json()

    const ambiente: Ambiente = cred.ambiente
    const sdk: AfipSdk = { accessToken: Deno.env.get("AFIPSDK_ACCESS_TOKEN")!, ambiente }
    const llave = Deno.env.get("FISCAL_CERTS_ENCRYPTION_KEY")!
    const cert = cred.cert_encrypted ? await decryptSecret(cred.cert_encrypted, llave) : undefined
    const key = cred.key_encrypted ? await decryptSecret(cred.key_encrypted, llave) : undefined

    // ── Ticket de acceso: se reutiliza el guardado mientras siga vigente ─────
    const obtenerAuth = async (forzar: boolean): Promise<AuthWsfe> => {
      const vigente = cred.ta_expira && new Date(cred.ta_expira).getTime() - Date.now() > MARGEN_TICKET_MS
      if (!forzar && vigente && cred.ta_token && cred.ta_sign) {
        return { Token: cred.ta_token, Sign: cred.ta_sign, Cuit: cred.cuit }
      }
      const ta = await obtenerTicketAcceso(sdk, { cuit: cred.cuit, wsid: "wsfe", cert, key, forzar })
      await admin.from("fiscal_credentials")
        .update({ ta_token: ta.token, ta_sign: ta.sign, ta_expira: ta.expiration })
        .eq("organization_id", org.id)
      return { Token: ta.token, Sign: ta.sign, Cuit: cred.cuit }
    }

    // El punto de venta es el de la organización, no el que manda la app
    const request: InvoiceRequest = { ...invoiceRequest, puntoVenta: org.punto_venta }

    let emision
    try {
      emision = await emitirComprobante(sdk, await obtenerAuth(false), request)
    } catch (err) {
      // 600-602: ARCA no reconoce el ticket de acceso (vencido o revocado) → se pide uno nuevo
      const ticketInvalido = err instanceof RechazoArca && [600, 601, 602].some((c) => err.tieneCodigo(c))
      if (!ticketInvalido) throw err
      emision = await emitirComprobante(sdk, await obtenerAuth(true), request)
    }

    const { error: insertError } = await admin.from("fiscal_comprobantes").insert({
      organization_id: org.id,
      ambiente,
      sale_id: saleId || null,
      original_comprobante_id: originalComprobanteId || null,
      tipo_cbte: request.tipoComprobante,
      punto_venta: request.puntoVenta,
      numero: emision.numero,
      fecha_emision: emision.fecha,
      cuit_receptor: request.cuitReceptor || null,
      razon_social_receptor: request.razonSocialReceptor || null,
      condicion_iva_receptor: request.condicionIVAReceptor,
      importe_neto: emision.importes.neto,
      importe_iva: emision.importes.iva,
      importe_total: emision.importes.total,
      cae: emision.cae,
      cae_vence: emision.caeVence,
      resultado: emision.resultado,
      observaciones: emision.observaciones.length ? emision.observaciones : null,
      raw_request: emision.solicitud,
      raw_response: emision.respuesta,
    })
    // El comprobante ya tiene CAE en ARCA: si no se pudo guardar, se avisa pero se devuelve igual
    if (insertError) console.error("fiscal-emit: no se pudo guardar el comprobante", emision.numero, insertError.message)

    return jsonResponse({
      ok: true,
      cae: emision.cae,
      caeVence: emision.caeVence,
      numero: emision.numero,
      resultado: emision.resultado,
      observaciones: emision.observaciones,
      ambiente,
    })

  } catch (err: any) {
    console.error("fiscal-emit error:", err?.message)
    return errorResponse(err?.message || "Error interno", err instanceof RechazoArca ? 400 : 500)
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

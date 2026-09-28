// Edge Function: fiscal-emit
// Emite facturas, notas de crédito y notas de débito con el certificado propio de la
// organización, a través de Afip SDK.

import { createClient } from "npm:@supabase/supabase-js@2"
import { type AfipSdk, AfipSdkError, type Ambiente, obtenerTicketAcceso } from "../_shared/afipsdk.ts"
import { decryptSecret } from "../_shared/crypto.ts"
import { usuarioDeLaSesion } from "../_shared/sesion.ts"
import { type AuthWsfe, calcularImportes, emitirComprobante, type InvoiceRequest, RechazoArca, receptorDe } from "../_shared/wsfe.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  // El navegador recuerda el permiso previo (preflight) y no lo vuelve a pedir en cada llamada
  "Access-Control-Max-Age": "86400",
}

// El ticket de acceso de ARCA dura 12 hs; se renueva si le quedan menos de 10 minutos
const MARGEN_TICKET_MS = 10 * 60 * 1000

const FACTURAS = [1, 6, 11]
const NOTAS_CREDITO = [3, 8, 13]

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return errorResponse("No autorizado", 401)

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const authId = await usuarioDeLaSesion(admin, authHeader)
    if (!authId) return errorResponse("No autorizado", 401)

    // Usuario, organización y certificado en una sola consulta
    const { data: dbUser } = await admin
      .from("users")
      .select("id, full_name, email, organization_id, organizations(id, fiscal_enabled, punto_venta, fiscal_credentials(*))")
      .eq("auth_id", authId)
      .single()
    if (!dbUser) return errorResponse("Usuario no encontrado", 404)

    const primero = <T>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null)
    const org: any = primero(dbUser.organizations as any)
    const cred: any = primero(org?.fiscal_credentials)
    if (!org?.fiscal_enabled || !cred?.activo) return errorResponse("Facturación electrónica no configurada")

    const { invoiceRequest, saleId, originalComprobanteId }: {
      invoiceRequest: InvoiceRequest
      saleId?: string
      originalComprobanteId?: string
    } = await req.json()

    const ambiente: Ambiente = cred.ambiente

    // Saldo de una factura: su total, más las notas de débito, menos las notas de crédito
    const saldoDe = async (facturaId: string, total: number) => {
      const { data: notas } = await admin.from("fiscal_comprobantes")
        .select("tipo_cbte, importe_total")
        .eq("original_comprobante_id", facturaId)
        .in("resultado", ["A", "O"])
      return (notas ?? []).reduce(
        (saldo, n) => saldo + (NOTAS_CREDITO.includes(n.tipo_cbte) ? -1 : 1) * Number(n.importe_total ?? 0),
        total,
      )
    }

    // Una venta se factura una sola vez, salvo que la factura anterior quedó anulada por completo
    if (saleId && FACTURAS.includes(invoiceRequest.tipoComprobante)) {
      const { data: previas } = await admin.from("fiscal_comprobantes")
        .select("id, punto_venta, numero, importe_total")
        .eq("organization_id", org.id)
        .eq("ambiente", ambiente)
        .eq("sale_id", saleId)
        .in("tipo_cbte", FACTURAS)
        .in("resultado", ["A", "O"])
      for (const previa of previas ?? []) {
        if (await saldoDe(previa.id, Number(previa.importe_total ?? 0)) > 0.05) {
          const numero = `${String(previa.punto_venta).padStart(5, "0")}-${String(previa.numero).padStart(8, "0")}`
          return errorResponse(`Esta venta ya tiene la factura ${numero}. Para volver a facturarla, primero anulala con una nota de crédito.`)
        }
      }
    }

    // Una nota de crédito no puede acreditar más de lo que queda de la factura
    if (originalComprobanteId && NOTAS_CREDITO.includes(invoiceRequest.tipoComprobante)) {
      const { data: original } = await admin.from("fiscal_comprobantes")
        .select("id, importe_total")
        .eq("id", originalComprobanteId)
        .eq("organization_id", org.id)
        .single()
      if (!original) return errorResponse("No se encontró la factura a acreditar")
      const saldo = await saldoDe(original.id, Number(original.importe_total ?? 0))
      const totalNota = calcularImportes(invoiceRequest.tipoComprobante, invoiceRequest.items).total
      if (totalNota > saldo + 0.05) {
        return errorResponse(`La nota de crédito ($${totalNota.toFixed(2)}) supera lo que queda de la factura ($${saldo.toFixed(2)})`)
      }
    }

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

    const receptor = receptorDe(request)
    const { error: insertError } = await admin.from("fiscal_comprobantes").insert({
      organization_id: org.id,
      ambiente,
      // Quién lo emitió (se ve en las listas, no en el PDF)
      created_by: dbUser.id,
      created_by_name: dbUser.full_name || dbUser.email,
      sale_id: saleId || null,
      original_comprobante_id: originalComprobanteId || null,
      tipo_cbte: request.tipoComprobante,
      punto_venta: request.puntoVenta,
      numero: emision.numero,
      fecha_emision: emision.fecha,
      doc_tipo: receptor.tipo,
      doc_nro: receptor.tipo === 99 ? null : receptor.nro,
      cuit_receptor: receptor.tipo === 80 ? receptor.nro : null,
      razon_social_receptor: request.razonSocialReceptor || null,
      condicion_iva_receptor: request.condicionIVAReceptor,
      items: request.items,
      alicuotas: emision.importes.alicuotas,
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
    // Al cliente se le muestra un mensaje claro; el detalle técnico queda en el log
    if (err instanceof AfipSdkError) {
      console.error("fiscal-emit Afip SDK:", err.status, err.message, JSON.stringify(err.body))
      return errorResponse("No pudimos comunicarnos con ARCA. Probá de nuevo en unos minutos.", 502)
    }
    console.error("fiscal-emit error:", err?.message)
    return errorResponse(err?.message || "Ocurrió un error. Probá de nuevo.", err instanceof RechazoArca ? 400 : 500)
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

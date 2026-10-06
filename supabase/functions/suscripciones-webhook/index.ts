// Edge Function: suscripciones-webhook
// Avisos de Mercado Pago sobre las suscripciones a Binary Goats (tópicos subscription_preapproval
// y subscription_authorized_payment). Público, sin sesión: lo llama Mercado Pago. Del aviso solo
// se usa el id; el estado real se lee siempre de la API (sincronizarSuscripcion), así que un aviso
// falso como mucho provoca una relectura. Igual se valida la firma cuando hay secreto configurado.
// Responde después de procesar para que, si algo falla, Mercado Pago reintente.

import { createClient } from "npm:@supabase/supabase-js@2"
import { hmacSha256Hex } from "../_shared/crypto.ts"
import { sincronizarSuscripcion } from "../_shared/suscripciones.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const url = new URL(req.url)
    const body = await req.json().catch(() => ({}) as any)
    // Formato webhook ({type, data.id}) y formato viejo IPN (?topic=&id=).
    const type = body?.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic")
    const dataId = body?.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id")

    if (!dataId || !type) return jsonResponse({ ok: true })
    const esSuscripcion = type === "subscription_preapproval" || type === "preapproval"
    const esCobro = type === "subscription_authorized_payment" || type === "authorized_payment"
    if (!esSuscripcion && !esCobro) return jsonResponse({ ok: true }) // otros tópicos: ignorar

    const secret = Deno.env.get("MP_SUBS_WEBHOOK_SECRET")
    if (secret && !(await isValidSignature(req, String(dataId), secret))) {
      return errorResponse("Firma inválida", 401)
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)
    await sincronizarSuscripcion(admin, esCobro ? { authorizedPaymentId: String(dataId) } : { preapprovalId: String(dataId) })

    return jsonResponse({ ok: true })
  } catch (err: any) {
    console.error("suscripciones-webhook error:", err)
    return errorResponse(err.message || "Error interno", 500)
  }
})

// Mismo esquema que mercadopago-webhook: "id:{data.id};request-id:{x-request-id};ts:{ts};"
// firmado con HMAC-SHA256.
async function isValidSignature(req: Request, dataId: string, secret: string): Promise<boolean> {
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
  return (await hmacSha256Hex(manifest, secret)) === v1
}

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

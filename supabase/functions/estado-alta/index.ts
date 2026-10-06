// Edge Function: estado-alta
// La consulta la página de bienvenida de la landing (binarygoats.com.ar/bg-tienda/bienvenida)
// cuando el cliente vuelve de Mercado Pago, hasta que la cuenta queda activa. Pública: recibe el
// id de la organización (un uuid que solo conoce quien hizo el alta) y devuelve lo mínimo para
// mostrar la pantalla. Si la cuenta sigue en pending, relee el estado de Mercado Pago: así se
// activa aunque el aviso del webhook todavía no haya llegado.

import { createClient } from "npm:@supabase/supabase-js@2"
import { sincronizarSuscripcion, storeSiteUrl } from "../_shared/suscripciones.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// Sin anclas a propósito: Mercado Pago le pega sus parámetros al back_url con otro "?", así que
// la página puede mandar "<uuid>?preapproval_id=...". Se toma el primer uuid que aparezca.
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const RELEER_CADA_MS = 8_000

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const body = await req.json().catch(() => ({}) as any)
    const cuenta = String(body?.cuenta ?? "").match(UUID_RE)?.[0]?.toLowerCase()
    if (!cuenta) return errorResponse("Cuenta inválida", 400)

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

    const { data: sub } = await admin
      .from("platform_subscriptions")
      .select("organization_id, contact_email, last_synced_at, organizations(slug, name, subscription_status)")
      .eq("organization_id", cuenta)
      .maybeSingle()
    if (!sub) return jsonResponse({ estado: "inexistente" })

    const org = sub.organizations as unknown as { slug: string; name: string; subscription_status: string }
    let estado = org.subscription_status

    const ultima = sub.last_synced_at ? Date.parse(sub.last_synced_at) : 0
    if (estado === "pending" && Date.now() - ultima > RELEER_CADA_MS) {
      try {
        estado = (await sincronizarSuscripcion(admin, { organizationId: cuenta }))?.status ?? estado
      } catch (err) {
        console.error("estado-alta: no se pudo sincronizar", cuenta, err)
      }
    }

    const site = storeSiteUrl()
    return jsonResponse({
      estado,
      negocio: org.name,
      email: enmascarar(sub.contact_email),
      tienda: `${site}/${org.slug}`,
      panel: `${site}/admin/login`,
    })
  } catch (err: any) {
    console.error("estado-alta error:", err)
    return errorResponse("No pudimos consultar tu cuenta", 500)
  }
})

function enmascarar(email: string | null): string | null {
  if (!email) return null
  const [usuario, dominio] = email.split("@")
  if (!dominio) return null
  return `${usuario.slice(0, 2)}${"*".repeat(Math.max(usuario.length - 2, 1))}@${dominio}`
}

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

// Edge Function: mercadopago-setup
// Conectar/desconectar la cuenta de Mercado Pago de una tienda, y consultar su estado. Mismo
// esqueleto que fiscal-setup: header Authorization del usuario -> auth.getUser() -> resuelve
// organization_id/role con ESE cliente (respeta RLS) -> recién ahí un cliente con
// service_role para las operaciones privilegiadas (store_mercadopago_credentials no tiene
// ninguna policy para anon/authenticated, ver migración 20260911100000).

import { createClient } from "npm:@supabase/supabase-js@2"
import { encryptSecret } from "../_shared/crypto.ts"

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
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return errorResponse("No autorizado", 401)

    const { data: dbUser } = await supabase
      .from("users")
      .select("id, organization_id, role")
      .eq("auth_id", user.id)
      .single()

    if (!dbUser) return errorResponse("Usuario no encontrado", 404)

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    const body = await req.json()
    const { action } = body

    // ── Consultar estado: cualquier miembro de la organización puede ver si está conectado ──
    if (action === "get_status") {
      const { data: creds } = await adminSupabase
        .from("store_mercadopago_credentials")
        .select("mp_email, live_mode")
        .eq("organization_id", dbUser.organization_id)
        .maybeSingle()

      return jsonResponse({
        ok: true,
        connected: !!creds,
        mpEmail: creds?.mp_email ?? null,
        liveMode: creds?.live_mode ?? null,
      })
    }

    // ── El resto de las acciones mueve la conexión de la tienda: solo owner/admin ──
    if (!["owner", "admin"].includes(dbUser.role)) {
      return errorResponse("Sin permisos", 403)
    }

    // ── Armar la URL de autorización de Mercado Pago ──
    if (action === "get_authorize_url") {
      const { state } = body
      if (!state) return errorResponse("Falta state")

      const clientId = Deno.env.get("MP_CLIENT_ID")
      const redirectUri = Deno.env.get("MP_REDIRECT_URI")
      if (!clientId || !redirectUri) {
        console.error("mercadopago-setup: faltan env vars", { hasClientId: !!clientId, hasRedirectUri: !!redirectUri })
        return errorResponse("Falta configurar MP_CLIENT_ID o MP_REDIRECT_URI", 500)
      }

      const params = new URLSearchParams({
        client_id: clientId,
        response_type: "code",
        platform_id: "mp", // obligatorio para operar como marketplace (split de pagos)
        state,
        redirect_uri: redirectUri,
      })

      // client_id y redirect_uri quedan en claro a propósito: son los dos valores que tienen
      // que coincidir EXACTO con lo configurado en el panel de la aplicación en Mercado Pago
      // Developers -- un mismatch acá es la causa típica de "la aplicación no está preparada
      // para operar" en la pantalla de autorización.
      console.log("mercadopago-setup: get_authorize_url", { clientId, redirectUri, organizationId: dbUser.organization_id })

      return jsonResponse({ ok: true, authorizeUrl: `https://auth.mercadopago.com.ar/authorization?${params}` })
    }

    // ── Intercambiar el "code" del callback por tokens, y guardarlos cifrados ──
    if (action === "exchange_code") {
      const { code } = body
      if (!code) return errorResponse("Falta code")

      const tokenResponse = await fetch("https://api.mercadopago.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: Deno.env.get("MP_CLIENT_ID")!,
          client_secret: Deno.env.get("MP_CLIENT_SECRET")!,
          grant_type: "authorization_code",
          code,
          redirect_uri: Deno.env.get("MP_REDIRECT_URI")!,
        }),
      })
      const tokenData = await tokenResponse.json().catch(() => null)

      if (!tokenResponse.ok || !tokenData?.access_token) {
        return errorResponse(`Mercado Pago rechazó la conexión: ${JSON.stringify(tokenData)}`)
      }

      // El email del vendedor es solo para mostrar "Conectado como: x@mail.com" en la UI --
      // si esta llamada falla no bloqueamos la conexión, el email queda null.
      const mpUser = await fetch(`https://api.mercadopago.com/users/${tokenData.user_id}`, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }).then((r) => r.json()).catch(() => null)

      const encryptionKey = Deno.env.get("MP_TOKENS_ENCRYPTION_KEY")!
      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

      const { error } = await adminSupabase.from("store_mercadopago_credentials").upsert(
        {
          organization_id: dbUser.organization_id,
          mp_user_id: String(tokenData.user_id),
          mp_email: mpUser?.email ?? null,
          access_token_encrypted: await encryptSecret(tokenData.access_token, encryptionKey),
          refresh_token_encrypted: await encryptSecret(tokenData.refresh_token, encryptionKey),
          token_expires_at: expiresAt,
          live_mode: tokenData.live_mode ?? true,
          connected_by: dbUser.id,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id" },
      )

      if (error) return errorResponse(error.message, 500)

      return jsonResponse({ ok: true })
    }

    // ── Desconectar: borra la fila. No se intenta revocar el token del lado de Mercado Pago
    //    (es opcional/best-effort) -- simplemente deja de usarse y expira solo. ──
    if (action === "disconnect") {
      // Si hay pedidos pagados con MP que todavía podrían necesitar reembolso, avisar antes de
      // desconectar -- una vez borradas las credenciales, mercadopago-refund deja de poder
      // operar sobre esos pedidos ("Esta tienda no tiene Mercado Pago conectado"). El cliente
      // puede repetir la acción con { force: true } para desconectar igual, a sabiendas.
      if (!body.force) {
        const { count } = await adminSupabase
          .from("store_orders")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", dbUser.organization_id)
          .eq("payment_method", "mercadopago")
          .in("status", ["pending", "confirmed"])
          .not("mp_payment_id", "is", null)

        if (count && count > 0) {
          const plural = count === 1 ? "" : "s"
          return errorResponse(
            `ORDERS_AT_RISK:Hay ${count} pedido${plural} pagado${plural} con Mercado Pago que todavía ` +
              `podría${plural ? "n" : ""} necesitar un reembolso. Si desconectás ahora, el botón ` +
              `"Reembolsar" de es${plural ? "os" : "e"} pedido${plural} va a dejar de funcionar.`,
            409,
          )
        }
      }

      await adminSupabase
        .from("store_mercadopago_credentials")
        .delete()
        .eq("organization_id", dbUser.organization_id)

      return jsonResponse({ ok: true })
    }

    return errorResponse("Acción desconocida")
  } catch (err: any) {
    console.error("mercadopago-setup error:", err)
    return errorResponse(err.message || "Error interno", 500)
  }
})

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

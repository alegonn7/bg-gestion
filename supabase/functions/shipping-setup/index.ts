// Edge Function: shipping-setup
// Conectar/desconectar un transportista de envío y configurar la dirección de origen de la
// tienda. Mismo esqueleto que fiscal-setup/mercadopago-setup: header Authorization del usuario
// -> auth.getUser() -> resuelve organization_id/role con ESE cliente -> recién ahí service_role
// (store_shipping_credentials no tiene ninguna policy pública, ver migración
// 20260912090100_bg_tienda_shipping_credentials.sql).

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

    // ── Estado + dirección de origen: cualquier miembro de la organización puede verlos ──
    if (action === "get_status") {
      const { data: settings } = await adminSupabase
        .from("store_settings")
        .select("branch_id, shipping_carrier")
        .eq("organization_id", dbUser.organization_id)
        .single()

      let connected = false
      let displayLabel: string | null = null
      let environment: string | null = null

      if (settings?.shipping_carrier) {
        const { data: creds } = await adminSupabase
          .from("store_shipping_credentials")
          .select("display_label, environment")
          .eq("organization_id", dbUser.organization_id)
          .eq("carrier", settings.shipping_carrier)
          .maybeSingle()
        connected = !!creds
        displayLabel = creds?.display_label ?? null
        environment = creds?.environment ?? null
      }

      let origin = null
      if (settings?.branch_id) {
        const { data: branch } = await adminSupabase
          .from("branches")
          .select(
            "shipping_origin_street, shipping_origin_number, shipping_origin_floor_apartment, shipping_origin_city, shipping_origin_province, shipping_origin_postal_code",
          )
          .eq("id", settings.branch_id)
          .single()
        origin = branch
      }

      return jsonResponse({
        ok: true,
        connected,
        carrier: settings?.shipping_carrier ?? null,
        displayLabel,
        environment,
        origin,
      })
    }

    // ── El resto mueve la conexión/configuración de la tienda: solo owner/admin ──
    if (!["owner", "admin"].includes(dbUser.role)) {
      return errorResponse("Sin permisos", 403)
    }

    if (action === "save_credentials") {
      const { carrier, environment, displayLabel, ...credentialFields } = body
      if (!carrier || !["correo_argentino", "andreani"].includes(carrier)) {
        return errorResponse("Transportista inválido")
      }

      const encryptionKey = Deno.env.get("SHIPPING_CREDENTIALS_ENCRYPTION_KEY")!
      const encrypted = await encryptSecret(JSON.stringify(credentialFields), encryptionKey)

      const { error } = await adminSupabase.from("store_shipping_credentials").upsert(
        {
          organization_id: dbUser.organization_id,
          carrier,
          credentials_encrypted: encrypted,
          environment: environment ?? "production",
          display_label: displayLabel ?? null,
          connected_by: dbUser.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,carrier" },
      )
      if (error) return errorResponse(error.message, 500)

      const { error: settingsError } = await adminSupabase
        .from("store_settings")
        .update({ shipping_carrier: carrier })
        .eq("organization_id", dbUser.organization_id)
      if (settingsError) return errorResponse(settingsError.message, 500)

      return jsonResponse({ ok: true })
    }

    if (action === "disconnect") {
      const { carrier } = body
      if (!carrier) return errorResponse("Falta carrier")

      await adminSupabase
        .from("store_shipping_credentials")
        .delete()
        .eq("organization_id", dbUser.organization_id)
        .eq("carrier", carrier)

      // Si era el transportista activo, apaga el feature -- no dejar shipping_enabled=true
      // apuntando a un transportista sin credenciales.
      await adminSupabase
        .from("store_settings")
        .update({ shipping_enabled: false, shipping_carrier: null })
        .eq("organization_id", dbUser.organization_id)
        .eq("shipping_carrier", carrier)

      return jsonResponse({ ok: true })
    }

    if (action === "save_origin_address") {
      const { data: settings } = await adminSupabase
        .from("store_settings")
        .select("branch_id")
        .eq("organization_id", dbUser.organization_id)
        .single()

      if (!settings?.branch_id) return errorResponse("No se pudo resolver la sucursal de la tienda", 404)

      const { street, number, floorApartment, city, province, postalCode } = body
      const { error } = await adminSupabase
        .from("branches")
        .update({
          shipping_origin_street: street || null,
          shipping_origin_number: number || null,
          shipping_origin_floor_apartment: floorApartment || null,
          shipping_origin_city: city || null,
          shipping_origin_province: province || null,
          shipping_origin_postal_code: postalCode || null,
        })
        .eq("id", settings.branch_id)
      if (error) return errorResponse(error.message, 500)

      return jsonResponse({ ok: true })
    }

    return errorResponse("Acción desconocida")
  } catch (err: any) {
    console.error("shipping-setup error:", err)
    return errorResponse(err.message || "Error interno", 500)
  }
})

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

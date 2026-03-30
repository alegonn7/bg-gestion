// Edge Function: fiscal-setup
// Guarda/lee la configuración fiscal del cliente (sin manejo de certificados)

import { createClient } from "npm:@supabase/supabase-js@2"

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
      .select("organization_id, role")
      .eq("auth_id", user.id)
      .single()

    if (!dbUser || !["owner", "admin"].includes(dbUser.role)) {
      return errorResponse("Sin permisos", 403)
    }

    const adminSupabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const body = await req.json()
    const { action } = body

    // ── Obtener configuración ────────────────────────────────────────────────
    if (action === "get_config") {
      const { data: org } = await adminSupabase
        .from("organizations")
        .select("fiscal_enabled, cuit, razon_social, condicion_iva, punto_venta, actividad_afip")
        .eq("id", dbUser.organization_id)
        .single()

      return jsonResponse({
        ok: true,
        config: org || null,
        // CUIT del desarrollador que el cliente debe autorizar en ARCA
        developer_cuit: Deno.env.get("FISCAL_DEVELOPER_CUIT") || "",
      })
    }

    // ── Guardar configuración ────────────────────────────────────────────────
    if (action === "save_config") {
      const { cuit, razonSocial, condicionIva, puntoVenta, actividadAfip } = body

      const cuitClean = (cuit || "").replace(/-/g, "")
      if (cuitClean.length !== 11) return errorResponse("CUIT inválido (11 dígitos)")
      if (!razonSocial?.trim()) return errorResponse("Ingresá la razón social")

      const { error: updateError } = await adminSupabase
        .from("organizations")
        .update({
          fiscal_enabled: true,
          cuit: cuitClean,
          razon_social: razonSocial.trim(),
          condicion_iva: condicionIva || "CF",
          punto_venta: puntoVenta || 1,
          actividad_afip: actividadAfip,
        })
        .eq("id", dbUser.organization_id)

      if (updateError) throw updateError

      return jsonResponse({ ok: true, message: "Configuración guardada" })
    }

    // ── Deshabilitar facturación ─────────────────────────────────────────────
    if (action === "delete_config") {
      await adminSupabase
        .from("organizations")
        .update({
          fiscal_enabled: false,
          cuit: null,
          razon_social: null,
          condicion_iva: null,
          punto_venta: 1,
          actividad_afip: null,
        })
        .eq("id", dbUser.organization_id)

      return jsonResponse({ ok: true })
    }

    return errorResponse("Acción desconocida")

  } catch (err: any) {
    console.error("fiscal-setup error:", err)
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

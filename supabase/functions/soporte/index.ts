// Edge Function: soporte
// Ingreso de soporte de plataforma (super admin). Con la cuenta de soporte del dueño de BG Gestión
// se puede entrar a cualquier organización EN SOLO LECTURA para diagnosticar. Cada ingreso queda
// registrado en support_access_log (server-side; el cliente no lo ve). No expone claves ni tokens y
// no permite operar la cuenta del cliente: el acceso de lectura lo dan las policies "soporte_ver".

import { createClient } from "npm:@supabase/supabase-js@2"
import { usuarioDeLaSesion } from "../_shared/sesion.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return errorResponse("No autorizado", 401)

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    )

    const authId = await usuarioDeLaSesion(admin, authHeader)
    if (!authId) return errorResponse("No autorizado", 401)

    // Solo un super admin de la plataforma puede usar esta función
    const { data: adminRow } = await admin
      .from("platform_admins").select("auth_id, email").eq("auth_id", authId).maybeSingle()
    if (!adminRow) return errorResponse("No autorizado", 403)

    const body = await req.json().catch(() => ({}))
    const accion = body.accion

    // Estado actual: a qué empresa está entrado el soporte (si a alguna)
    if (accion === "estado") {
      const { data } = await admin
        .from("platform_admin_active_org").select("organization_id, entered_at").eq("auth_id", authId).maybeSingle()
      return jsonResponse({ ok: true, es_admin: true, empresa_activa: data?.organization_id ?? null })
    }

    // Lista de empresas para elegir a cuál dar soporte
    if (accion === "empresas") {
      const { data, error } = await admin
        .from("organizations").select("id, name").order("name")
      if (error) throw error
      return jsonResponse({ ok: true, empresas: data ?? [] })
    }

    // Entrar a una empresa (solo lectura). Queda registrado.
    if (accion === "entrar") {
      const organizationId = String(body.organizationId || "")
      const { data: org } = await admin.from("organizations").select("id, name").eq("id", organizationId).maybeSingle()
      if (!org) return errorResponse("Empresa no encontrada")

      const { error } = await admin.from("platform_admin_active_org")
        .upsert({ auth_id: authId, organization_id: org.id, entered_at: new Date().toISOString() })
      if (error) throw error

      await admin.from("support_access_log").insert({
        admin_auth_id: authId,
        admin_email: adminRow.email,
        organization_id: org.id,
        accion: "ingreso",
        detalle: { empresa: org.name },
      })
      return jsonResponse({ ok: true, empresa: org })
    }

    // Salir (dejar de soportar esa empresa)
    if (accion === "salir") {
      const { data: previa } = await admin
        .from("platform_admin_active_org").select("organization_id").eq("auth_id", authId).maybeSingle()
      await admin.from("platform_admin_active_org").delete().eq("auth_id", authId)
      if (previa?.organization_id) {
        await admin.from("support_access_log").insert({
          admin_auth_id: authId, admin_email: adminRow.email, organization_id: previa.organization_id, accion: "salida",
        })
      }
      return jsonResponse({ ok: true })
    }

    return errorResponse("Acción desconocida")
  } catch (err: any) {
    console.error("soporte error:", err?.message)
    return errorResponse("No se pudo completar la operación. Probá de nuevo.", 500)
  }
})

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}
function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

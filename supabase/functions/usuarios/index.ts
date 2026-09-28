// Edge Function: usuarios
// Alta, baja y cambio de contraseña de los usuarios de una organización. Crear o borrar cuentas de
// acceso necesita la clave de administrador de Supabase, que existe solo acá en el servidor: la app
// instalada en las computadoras de los clientes no la tiene.

import { createClient } from "npm:@supabase/supabase-js@2"
import { usuarioDeLaSesion } from "../_shared/sesion.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
}

type Rol = "owner" | "admin" | "manager" | "employee"

interface Usuario {
  id: string
  auth_id: string
  organization_id: string
  role: Rol
  branch_id: string | null
  is_active: boolean
}

// Qué roles puede crear cada rol (lo mismo que ofrece la app)
const ROLES_QUE_CREA: Record<Rol, Rol[]> = {
  owner: ["admin", "manager", "employee"],
  admin: ["manager", "employee"],
  manager: ["employee"],
  employee: [],
}

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

    const { data: actor } = await admin
      .from("users")
      .select("id, auth_id, organization_id, role, branch_id, is_active")
      .eq("auth_id", authId)
      .single<Usuario>()
    if (!actor || !actor.is_active) return errorResponse("No autorizado", 403)

    const body = await req.json()

    // Un usuario de la misma organización
    const buscarUsuario = async (id: string) => {
      const { data } = await admin
        .from("users")
        .select("id, auth_id, organization_id, role, branch_id, is_active")
        .eq("id", id)
        .eq("organization_id", actor.organization_id)
        .maybeSingle<Usuario>()
      return data
    }

    // ── Crear un usuario con email y contraseña ─────────────────────────────
    if (body.accion === "crear") {
      const email = String(body.email || "").trim().toLowerCase()
      const password = String(body.password || "")
      const nombre = String(body.full_name || "").trim()
      const rol = body.role as Rol
      let sucursal: string | null = body.branch_id || null

      if (!ROLES_QUE_CREA[actor.role]?.includes(rol)) return errorResponse("No tenés permiso para crear usuarios con ese rol", 403)
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return errorResponse("El email no es válido")
      if (password.length < 6) return errorResponse("La contraseña debe tener al menos 6 caracteres")
      if (!nombre) return errorResponse("El nombre completo es obligatorio")

      if (rol === "manager" || rol === "employee") {
        // Un encargado solo suma empleados a su propia sucursal
        if (actor.role === "manager") sucursal = actor.branch_id
        if (!sucursal) return errorResponse("Elegí la sucursal de este usuario")
        const { data: existe } = await admin
          .from("branches")
          .select("id")
          .eq("id", sucursal)
          .eq("organization_id", actor.organization_id)
          .maybeSingle()
        if (!existe) return errorResponse("La sucursal no existe")
      } else {
        // Dueño y administrador trabajan con todas las sucursales
        sucursal = null
      }

      const { data: creado, error: authError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (authError || !creado.user) return errorResponse(mensajeDeCuenta(authError, "No se pudo crear el usuario. Probá de nuevo."))

      const { data: fila, error: dbError } = await admin
        .from("users")
        .insert({
          auth_id: creado.user.id,
          email,
          full_name: nombre,
          organization_id: actor.organization_id,
          branch_id: sucursal,
          role: rol,
          is_active: true,
        })
        .select("*, branches (id, name)")
        .single()

      if (dbError) {
        // Sin su fila en users la cuenta no sirve: se borra para poder reintentar con el mismo email
        await admin.auth.admin.deleteUser(creado.user.id)
        return errorResponse(mensajeDeBase(dbError))
      }
      return jsonResponse({ ok: true, usuario: fila })
    }

    // ── Eliminar un usuario (solo el dueño) ─────────────────────────────────
    if (body.accion === "eliminar") {
      if (actor.role !== "owner") return errorResponse("Solo el dueño puede eliminar usuarios", 403)
      const objetivo = await buscarUsuario(String(body.id || ""))
      if (!objetivo) return errorResponse("Usuario no encontrado", 404)
      if (objetivo.id === actor.id) return errorResponse("No podés eliminar tu propio usuario")

      // Primero la fila: si tiene ventas u otros registros a su nombre, no se borra nada
      const { error: dbError } = await admin.from("users").delete().eq("id", objetivo.id)
      if (dbError) {
        if (dbError.code === "23503") {
          return errorResponse("Este usuario ya tiene ventas u otros registros a su nombre, así que no se puede eliminar. Desactivalo y no va a poder entrar más.")
        }
        throw dbError
      }
      const { error: authError } = await admin.auth.admin.deleteUser(objetivo.auth_id)
      if (authError) console.error("No se pudo borrar la cuenta de acceso:", authError.message)
      return jsonResponse({ ok: true })
    }

    // ── Poner una contraseña nueva a otro usuario (por ejemplo, si se la olvidó) ──
    if (body.accion === "cambiar_clave") {
      const objetivo = await buscarUsuario(String(body.id || ""))
      if (!objetivo) return errorResponse("Usuario no encontrado", 404)
      if (!puedeGestionar(actor, objetivo)) return errorResponse("No tenés permiso para cambiar la contraseña de este usuario", 403)
      const password = String(body.password || "")
      if (password.length < 6) return errorResponse("La contraseña debe tener al menos 6 caracteres")

      const { error } = await admin.auth.admin.updateUserById(objetivo.auth_id, { password })
      if (error) return errorResponse(mensajeDeCuenta(error, "No se pudo cambiar la contraseña. Probá de nuevo."))
      return jsonResponse({ ok: true })
    }

    return errorResponse("Acción desconocida")
  } catch (err: any) {
    console.error("usuarios:", err?.message ?? err)
    return errorResponse("No se pudo completar la operación. Probá de nuevo en unos minutos.", 500)
  }
})

// Igual que en la app: el dueño gestiona a todos, el administrador a todos menos al dueño y el
// encargado a los empleados de su sucursal
function puedeGestionar(actor: Usuario, objetivo: Usuario): boolean {
  if (actor.role === "owner") return true
  if (actor.role === "admin") return objetivo.role !== "owner"
  if (actor.role === "manager") return objetivo.role === "employee" && objetivo.branch_id === actor.branch_id
  return false
}

function mensajeDeCuenta(error: any, porDefecto: string): string {
  const texto = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase()
  if (texto.includes("email_exists") || texto.includes("already been registered")) return "Ya existe un usuario con ese email"
  if (texto.includes("weak_password") || texto.includes("password should")) return "La contraseña es muy débil: usá al menos 6 caracteres"
  if (texto.includes("email_address_invalid") || texto.includes("invalid email")) return "El email no es válido"
  console.error("Cuenta de acceso:", error?.message ?? error)
  return porDefecto
}

function mensajeDeBase(error: any): string {
  // El límite de usuarios del plan viene de la base con un mensaje ya pensado para el cliente
  if (typeof error?.message === "string" && error.message.startsWith("Límite de usuarios")) return error.message
  if (error?.code === "23505") return "Ya existe un usuario con ese email"
  console.error("Alta de usuario:", error?.message ?? error)
  return "No se pudo crear el usuario. Probá de nuevo."
}

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

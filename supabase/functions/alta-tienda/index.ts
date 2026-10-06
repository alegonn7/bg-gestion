// Edge Function: alta-tienda
// Alta automática desde la landing (binarygoats.com.ar/bg-tienda/empezar). Pública, sin sesión:
// crea el usuario dueño, la organización con plan "tienda" en estado pending, su sucursal y su
// tienda, y una suscripción de Mercado Pago por el primer mes al 50%. Devuelve el link de pago.
// La cuenta queda sin acceso y la tienda sin publicar hasta que sincronizarSuscripcion() ve la
// tarjeta autorizada o el primer cobro aprobado. Si algo falla a mitad de camino se deshace todo.
// También devuelve un código de acceso de un solo uso (ver estado-alta) para que, al volver de
// Mercado Pago, el cliente entre al panel sin volver a escribir la contraseña.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2"
import { generarAcceso, mpFetch, precioPrimerMes } from "../_shared/suscripciones.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Rutas de bg-tienda y nombres que no conviene regalar como dirección de tienda.
const SLUGS_RESERVADOS = new Set([
  "admin", "api", "www", "app", "login", "logout", "registro", "signup", "empezar", "bienvenida", "tienda", "tiendas",
  "bg-tienda", "bgtienda", "binarygoats", "binary-goats", "soporte", "ayuda", "help", "static", "assets", "_next",
  "robots", "sitemap", "favicon", "pedido", "pedidos", "checkout", "carrito", "mercadopago", "auth",
])
const MAX_ALTAS_POR_HORA = 5

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return errorResponse("Método no permitido", 405)

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!)

  try {
    const body = await req.json().catch(() => ({}) as any)

    // Solo para el formulario de la landing: chequear si la dirección de la tienda está libre. El
    // email no se chequea acá para no ofrecer una forma fácil de averiguar quién es cliente.
    if (body.accion === "verificar") {
      const { slugLibre } = await verificarDisponibilidad(admin, body.slug, null)
      return jsonResponse({ slugLibre })
    }

    const negocio = String(body.negocio ?? "").trim()
    const slug = String(body.slug ?? "").trim().toLowerCase()
    const nombre = String(body.nombre ?? "").trim()
    const email = String(body.email ?? "").trim().toLowerCase()
    const whatsapp = String(body.whatsapp ?? "").replace(/[^\d+]/g, "")
    const password = String(body.password ?? "")
    const emailMP = String(body.email_mercadopago ?? "").trim().toLowerCase() || null

    if (negocio.length < 2 || negocio.length > 80) return errorResponse("Escribí el nombre de tu negocio")
    if (!SLUG_RE.test(slug) || slug.length < 3 || slug.length > 40)
      return errorResponse("La dirección de la tienda solo puede tener minúsculas, números y guiones (entre 3 y 40 caracteres)")
    if (SLUGS_RESERVADOS.has(slug)) return errorResponse("Esa dirección no está disponible, probá con otra")
    if (nombre.length < 2) return errorResponse("Escribí tu nombre")
    if (!EMAIL_RE.test(email)) return errorResponse("El email no es válido")
    if (emailMP && !EMAIL_RE.test(emailMP)) return errorResponse("El email de Mercado Pago no es válido")
    if (whatsapp.replace(/\D/g, "").length < 8) return errorResponse("Escribí un WhatsApp válido")
    if (password.length < 8) return errorResponse("La contraseña tiene que tener al menos 8 caracteres")

    // Freno a altas en masa: por IP, y captcha si está configurado.
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconocida"
    const desde = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count } = await admin
      .from("platform_signup_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", desde)
    if ((count ?? 0) >= MAX_ALTAS_POR_HORA) return errorResponse("Demasiados intentos. Probá de nuevo en un rato.", 429)
    await admin.from("platform_signup_attempts").insert({ ip })

    if (!(await captchaValido(body.captcha, ip))) return errorResponse("No pudimos verificar que no seas un robot. Recargá la página y probá de nuevo.")

    const disponible = await verificarDisponibilidad(admin, slug, email)
    if (!disponible.slugLibre) return errorResponse("Esa dirección de tienda ya está en uso, probá con otra", 409)
    if (!disponible.emailLibre) return errorResponse("Ya hay una cuenta con ese email. Si es tuya, entrá desde el panel de tu tienda.", 409)

    const { data: plan } = await admin
      .from("plan_config")
      .select("plan_name, price_per_branch, max_branches, max_products_per_branch, max_users_per_branch, is_active")
      .eq("plan_name", "tienda")
      .maybeSingle()
    if (!plan?.is_active) return errorResponse("El plan no está disponible en este momento", 503)

    const precio = Number(plan.price_per_branch)
    const primerMes = precioPrimerMes(precio)

    const creado = await crearCuenta(admin, { negocio, slug, nombre, email, whatsapp, password, emailMP, plan, precio, primerMes })
    if ("error" in creado) return errorResponse(creado.error, creado.status)

    const siteUrl = (Deno.env.get("LANDING_SITE_URL") ?? "https://www.binarygoats.com.ar").replace(/\/$/, "")
    // Si Mercado Pago no responde (o falta el token) también se deshace el alta: si no, la cuenta
    // quedaría ocupando el email y la dirección hasta que la limpie el cron.
    const preapproval = await mpFetch("/preapproval", {
      method: "POST",
      body: JSON.stringify({
        reason: `BG Tienda — ${negocio}`,
        external_reference: creado.organizationId,
        payer_email: emailMP ?? email,
        auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: primerMes, currency_id: "ARS" },
        back_url: `${siteUrl}/bg-tienda/bienvenida?cuenta=${creado.organizationId}`,
        notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/suscripciones-webhook`,
        status: "pending",
      }),
    }).catch((err) => {
      console.error("alta-tienda: falló la llamada a Mercado Pago", err)
      return { ok: false, status: 0, data: null }
    })

    if (!preapproval.ok || !preapproval.data?.id || !preapproval.data?.init_point) {
      console.error("alta-tienda: Mercado Pago no creó la suscripción", preapproval.status, preapproval.data)
      await deshacerAlta(admin, creado.organizationId, creado.authId)
      return errorResponse(mensajeMercadoPago(preapproval.data), 502)
    }

    const acceso = await generarAcceso()
    await admin
      .from("platform_subscriptions")
      .update({
        mp_preapproval_id: String(preapproval.data.id),
        mp_status: preapproval.data.status ?? "pending",
        acceso_hash: acceso.hash,
        acceso_vence_at: acceso.venceAt,
      })
      .eq("organization_id", creado.organizationId)

    return jsonResponse({ ok: true, cuenta: creado.organizationId, init_point: preapproval.data.init_point, acceso: acceso.codigo })
  } catch (err: any) {
    console.error("alta-tienda error:", err)
    return errorResponse("No pudimos crear tu cuenta. Probá de nuevo en unos minutos.", 500)
  }
})

async function verificarDisponibilidad(admin: SupabaseClient, slugRaw: unknown, emailRaw: unknown) {
  const slug = String(slugRaw ?? "").trim().toLowerCase()
  const email = String(emailRaw ?? "").trim().toLowerCase()
  let slugLibre = true
  let emailLibre = true
  if (slug) {
    if (!SLUG_RE.test(slug) || SLUGS_RESERVADOS.has(slug)) slugLibre = false
    else {
      const { data } = await admin.from("organizations").select("id").eq("slug", slug).maybeSingle()
      slugLibre = !data
    }
  }
  if (email) {
    const { data } = await admin.from("users").select("id").eq("email", email).maybeSingle()
    emailLibre = !data
  }
  return { slugLibre, emailLibre }
}

async function crearCuenta(
  admin: SupabaseClient,
  d: {
    negocio: string
    slug: string
    nombre: string
    email: string
    whatsapp: string
    password: string
    emailMP: string | null
    plan: { plan_name: string; max_branches: number; max_products_per_branch: number; max_users_per_branch: number }
    precio: number
    primerMes: number
  },
): Promise<{ organizationId: string; authId: string } | { error: string; status: number }> {
  const { data: auth, error: authError } = await admin.auth.admin.createUser({
    email: d.email,
    password: d.password,
    email_confirm: true,
    user_metadata: { full_name: d.nombre },
  })
  if (authError || !auth.user) {
    const yaExiste = /already|registered|exists/i.test(authError?.message ?? "")
    return yaExiste
      ? { error: "Ya hay una cuenta con ese email. Si es tuya, entrá desde el panel de tu tienda.", status: 409 }
      : { error: "No pudimos crear tu usuario. Revisá los datos y probá de nuevo.", status: 400 }
  }
  const authId = auth.user.id
  let organizationId: string | null = null

  try {
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .insert({
        name: d.negocio,
        slug: d.slug,
        plan: d.plan.plan_name,
        subscription_status: "pending",
        trial_ends_at: null,
        max_branches: d.plan.max_branches,
        max_products_per_branch: d.plan.max_products_per_branch,
        max_users_per_branch: d.plan.max_users_per_branch,
        is_active: true,
      })
      .select("id")
      .single()
    if (orgError || !org) {
      if (orgError?.code === "23505") throw new ErrorVisible("Esa dirección de tienda ya está en uso, probá con otra", 409)
      throw orgError ?? new Error("organizations insert sin fila")
    }
    organizationId = org.id

    const { data: branch, error: branchError } = await admin
      .from("branches")
      .insert({ organization_id: org.id, name: "Tienda online", email: d.email, phone: d.whatsapp, is_active: true })
      .select("id")
      .single()
    if (branchError || !branch) throw branchError ?? new Error("branches insert sin fila")

    const { error: userError } = await admin.from("users").insert({
      auth_id: authId,
      email: d.email,
      full_name: d.nombre,
      organization_id: org.id,
      branch_id: null,
      role: "owner",
      is_active: true,
    })
    if (userError) throw userError

    const { error: storeError } = await admin.from("store_settings").insert({
      organization_id: org.id,
      branch_id: branch.id,
      store_name: d.negocio,
      whatsapp_number: d.whatsapp,
      whatsapp_orders_enabled: true,
      show_prices: true,
      enabled: true, // no se publica igual hasta que la cuenta pase a active (ver vista store_directory)
    })
    if (storeError) throw storeError

    const { error: subError } = await admin.from("platform_subscriptions").insert({
      organization_id: org.id,
      product: "tienda",
      plan: d.plan.plan_name,
      first_amount: d.primerMes,
      full_amount: d.precio,
      current_amount: d.primerMes,
      contact_name: d.nombre,
      contact_email: d.email,
      contact_phone: d.whatsapp,
      payer_email: d.emailMP,
    })
    if (subError) throw subError

    return { organizationId: org.id, authId }
  } catch (err: any) {
    console.error("alta-tienda: falló el alta, deshaciendo", err)
    await deshacerAlta(admin, organizationId, authId)
    if (err instanceof ErrorVisible) return { error: err.message, status: err.status }
    return { error: "No pudimos crear tu cuenta. Probá de nuevo en unos minutos.", status: 500 }
  }
}

async function deshacerAlta(admin: SupabaseClient, organizationId: string | null, authId: string): Promise<void> {
  if (organizationId) {
    await admin.from("store_settings").delete().eq("organization_id", organizationId)
    const { error } = await admin.from("organizations").delete().eq("id", organizationId)
    if (error) console.error("alta-tienda: no se pudo borrar la organización", organizationId, error)
  }
  const { error } = await admin.auth.admin.deleteUser(authId)
  if (error) console.error("alta-tienda: no se pudo borrar el usuario", authId, error)
}

// Cloudflare Turnstile. Sin TURNSTILE_SECRET_KEY configurado se omite (queda solo el límite por IP).
async function captchaValido(token: unknown, ip: string): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY")
  if (!secret) return true
  if (typeof token !== "string" || !token) return false
  const form = new FormData()
  form.append("secret", secret)
  form.append("response", token)
  if (ip !== "desconocida") form.append("remoteip", ip)
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form })
  const data = await res.json().catch(() => null)
  return data?.success === true
}

function mensajeMercadoPago(data: any): string {
  const texto = JSON.stringify(data ?? {}).toLowerCase()
  if (texto.includes("payer_email") || texto.includes("payer email")) {
    return "Mercado Pago no aceptó ese email. Usá el email de tu cuenta de Mercado Pago en el campo correspondiente."
  }
  return "No pudimos conectar con Mercado Pago. Probá de nuevo en unos minutos."
}

class ErrorVisible extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

function errorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: message }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } })
}

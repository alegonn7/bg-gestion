// Edge Function: fiscal-setup
// Configuración fiscal de la organización y alta en ARCA con Afip SDK: con el CUIT y la clave
// fiscal del cliente se crea su propio certificado, se lo autoriza para facturar (wsfe) y se
// busca o crea su punto de venta. La clave fiscal se usa en cada paso y nunca se guarda.

import { createClient } from "npm:@supabase/supabase-js@2"
import { type AfipSdk, type Ambiente, consultarAutomatizacion, iniciarAutomatizacion } from "../_shared/afipsdk.ts"
import { encryptSecret } from "../_shared/crypto.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// CUIT de prueba de Afip SDK: factura en homologación sin certificado propio
const CUIT_PRUEBA = "20409378472"

type Paso = "certificado" | "autorizacion" | "puntos_venta" | "punto_venta" | "listo"

interface Alta {
  organization_id: string
  cuit: string
  usuario: string
  ambiente: Ambiente
  paso: Paso
  estado: "en_curso" | "error" | "listo"
  automatizacion_id: string | null
  cert_alias: string | null
  punto_venta: number | null
  error: string | null
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

    if (!dbUser) return errorResponse("Usuario no encontrado", 404)

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )
    const orgId: string = dbUser.organization_id
    const ambienteNuevo: Ambiente = Deno.env.get("AFIPSDK_ENVIRONMENT") === "prod" ? "prod" : "dev"
    const sdkPara = (ambiente: Ambiente): AfipSdk => ({ accessToken: Deno.env.get("AFIPSDK_ACCESS_TOKEN")!, ambiente })

    const body = await req.json()
    const { action } = body

    // ── Configuración actual (cualquier usuario de la organización) ─────────
    if (action === "get_config") {
      const [{ data: org }, { data: cred }, { data: alta }] = await Promise.all([
        admin.from("organizations")
          .select("fiscal_enabled, cuit, razon_social, condicion_iva, punto_venta, actividad_afip, domicilio_comercial, ingresos_brutos, inicio_actividades")
          .eq("id", orgId).single(),
        admin.from("fiscal_credentials").select("ambiente, activo").eq("organization_id", orgId).maybeSingle(),
        admin.from("fiscal_onboarding").select("paso, estado, error, punto_venta").eq("organization_id", orgId).maybeSingle(),
      ])
      return jsonResponse({
        ok: true,
        config: org ? { ...org, ambiente: cred?.ambiente ?? ambienteNuevo, conectado: !!cred?.activo } : null,
        alta: alta ?? null,
        ambiente_nuevo: ambienteNuevo,
      })
    }

    // El resto modifica la configuración: solo dueños y administradores
    if (!["owner", "admin"].includes(dbUser.role)) return errorResponse("Sin permisos", 403)

    // ── Iniciar el alta: primer paso, crear el certificado del cliente ──────
    if (action === "alta_iniciar") {
      const cuit = soloDigitos(body.cuit)
      const usuario = soloDigitos(body.usuario) || cuit
      const clave: string = body.clave || ""
      if (cuit.length !== 11) return errorResponse("CUIT inválido (11 dígitos)")
      if (usuario.length !== 11) return errorResponse("CUIT/CUIL de ingreso a ARCA inválido (11 dígitos)")
      if (!clave) return errorResponse("Ingresá la clave fiscal")
      if (!body.razonSocial?.trim()) return errorResponse("Ingresá la razón social")

      const { error: orgError } = await admin.from("organizations").update({
        fiscal_enabled: false,
        cuit,
        razon_social: body.razonSocial.trim(),
        condicion_iva: body.condicionIva || "Monotributo",
        actividad_afip: body.actividadAfip || null,
      }).eq("id", orgId)
      if (orgError) throw orgError

      const alias = `bg${Date.now().toString(36)}`
      const automatizacion = await iniciarAutomatizacion(sdkPara(ambienteNuevo), `create-cert-${ambienteNuevo}`, {
        cuit, username: usuario, password: clave, alias,
      })

      const alta: Alta = {
        organization_id: orgId,
        cuit,
        usuario,
        ambiente: ambienteNuevo,
        paso: "certificado",
        estado: "en_curso",
        automatizacion_id: automatizacion.id,
        cert_alias: alias,
        punto_venta: Number(body.puntoVenta) || null,
        error: null,
      }
      const { error } = await admin.from("fiscal_onboarding").upsert({ ...alta, updated_at: new Date().toISOString() })
      if (error) throw error
      return jsonResponse({ ok: true, alta: resumen(alta) })
    }

    // ── Avanzar el alta: la app lo llama cada pocos segundos hasta terminar ─
    if (action === "alta_avanzar") {
      const { data: alta } = await admin.from("fiscal_onboarding").select("*").eq("organization_id", orgId).maybeSingle()
      if (!alta) return errorResponse("No hay un alta en curso")
      if (alta.estado !== "en_curso" || !alta.automatizacion_id) return jsonResponse({ ok: true, alta: resumen(alta) })

      const sdk = sdkPara(alta.ambiente)
      const automatizacion = await consultarAutomatizacion(sdk, alta.automatizacion_id)
      if (automatizacion.status !== "complete" && automatizacion.status !== "error") {
        return jsonResponse({ ok: true, alta: resumen(alta) })
      }

      let siguiente: Alta
      if (automatizacion.status === "error") {
        siguiente = { ...alta, estado: "error", error: mensajeDeError(automatizacion.data) }
      } else {
        try {
          siguiente = await procesarPaso(admin, sdk, alta, automatizacion.data, body.clave || "")
        } catch (err) {
          siguiente = { ...alta, estado: "error", error: (err as Error).message }
        }
      }
      const { error } = await admin.from("fiscal_onboarding")
        .update({ ...siguiente, updated_at: new Date().toISOString() })
        .eq("organization_id", orgId)
      if (error) throw error
      return jsonResponse({ ok: true, alta: resumen(siguiente) })
    }

    // ── Reintentar el paso que falló (por ejemplo, con la clave corregida) ──
    if (action === "alta_reintentar") {
      const { data: alta } = await admin.from("fiscal_onboarding").select("*").eq("organization_id", orgId).maybeSingle()
      if (!alta || alta.estado !== "error") return errorResponse("No hay un paso para reintentar")
      if (!body.clave) return errorResponse("Ingresá la clave fiscal")
      if (body.puntoVenta) alta.punto_venta = Number(body.puntoVenta)
      // Un certificado nuevo va con otro alias, por si ARCA llegó a registrar el anterior
      if (alta.paso === "certificado") alta.cert_alias = `bg${Date.now().toString(36)}`

      const siguiente = await iniciarPaso(sdkPara(alta.ambiente), alta, alta.paso, body.clave, admin)
      const { error } = await admin.from("fiscal_onboarding")
        .update({ ...siguiente, updated_at: new Date().toISOString() })
        .eq("organization_id", orgId)
      if (error) throw error
      return jsonResponse({ ok: true, alta: resumen(siguiente) })
    }

    if (action === "alta_cancelar") {
      await admin.from("fiscal_onboarding").delete().eq("organization_id", orgId)
      return jsonResponse({ ok: true })
    }

    // ── Probar sin clave fiscal: CUIT de prueba de Afip SDK (solo en modo prueba) ─
    if (action === "usar_cuit_prueba") {
      if (ambienteNuevo !== "dev") return errorResponse("El CUIT de prueba solo existe en modo prueba")
      // Punto de venta al azar: el CUIT de prueba lo comparten todos los usuarios de Afip SDK
      const puntoVenta = 1000 + Math.floor(Math.random() * 8000)
      const { error: credError } = await admin.from("fiscal_credentials").upsert({
        organization_id: orgId,
        cuit: CUIT_PRUEBA,
        ambiente: "dev",
        cert_alias: null,
        cert_encrypted: null,
        key_encrypted: null,
        activo: true,
        ta_token: null,
        ta_sign: null,
        ta_expira: null,
        updated_at: new Date().toISOString(),
      })
      if (credError) throw credError
      await admin.from("fiscal_onboarding").delete().eq("organization_id", orgId)
      // En homologación el CUIT de prueba puede facturar como inscripto (A/B) o monotributista (C)
      const condicionIva = ["RI", "Monotributo", "Exento"].includes(body.condicionIva) ? body.condicionIva : "RI"
      const { error } = await admin.from("organizations").update({
        fiscal_enabled: true,
        cuit: CUIT_PRUEBA,
        razon_social: "CUIT de prueba (Afip SDK)",
        condicion_iva: condicionIva,
        punto_venta: puntoVenta,
      }).eq("id", orgId)
      if (error) throw error
      return jsonResponse({ ok: true })
    }

    // ── Editar datos del negocio (los que salen impresos en la factura) ──────
    if (action === "save_config") {
      const { razonSocial, condicionIva, actividadAfip, domicilioComercial, ingresosBrutos, inicioActividades } = body
      if (!razonSocial?.trim()) return errorResponse("Ingresá la razón social")
      const { error } = await admin.from("organizations").update({
        razon_social: razonSocial.trim(),
        condicion_iva: condicionIva || "Monotributo",
        actividad_afip: actividadAfip || null,
        domicilio_comercial: domicilioComercial?.trim() || null,
        ingresos_brutos: ingresosBrutos?.trim() || null,
        inicio_actividades: inicioActividades || null,
      }).eq("id", orgId)
      if (error) throw error
      return jsonResponse({ ok: true, message: "Configuración guardada" })
    }

    // ── Desconectar: borra el certificado y deshabilita la facturación ──────
    if (action === "delete_config") {
      await admin.from("fiscal_credentials").delete().eq("organization_id", orgId)
      await admin.from("fiscal_onboarding").delete().eq("organization_id", orgId)
      await admin.from("organizations").update({ fiscal_enabled: false }).eq("id", orgId)
      return jsonResponse({ ok: true })
    }

    return errorResponse("Acción desconocida")

  } catch (err: any) {
    console.error("fiscal-setup error:", err?.message)
    return errorResponse(err?.message || "Error interno", 500)
  }
})

// ─── Pasos del alta ──────────────────────────────────────────────────────────

// Procesa el resultado de la automatización del paso actual y arranca la del siguiente
async function procesarPaso(admin: any, sdk: AfipSdk, alta: Alta, data: any, clave: string): Promise<Alta> {
  if (alta.paso === "certificado") {
    if (!data?.cert || !data?.key) throw new Error("Afip SDK no devolvió el certificado")
    const llave = Deno.env.get("FISCAL_CERTS_ENCRYPTION_KEY")!
    const { error } = await admin.from("fiscal_credentials").upsert({
      organization_id: alta.organization_id,
      cuit: alta.cuit,
      ambiente: alta.ambiente,
      cert_alias: alta.cert_alias,
      cert_encrypted: await encryptSecret(data.cert, llave),
      key_encrypted: await encryptSecret(data.key, llave),
      activo: false,
      ta_token: null,
      ta_sign: null,
      ta_expira: null,
      updated_at: new Date().toISOString(),
    })
    if (error) throw error
    return iniciarPaso(sdk, alta, "autorizacion", clave, admin)
  }

  if (alta.paso === "autorizacion") {
    // En homologación no hace falta dar de alta el punto de venta en ARCA
    if (alta.ambiente === "dev") return terminar(admin, alta, alta.punto_venta || 1)
    return iniciarPaso(sdk, alta, "puntos_venta", clave, admin)
  }

  if (alta.paso === "puntos_venta") {
    const { data: org } = await admin.from("organizations").select("condicion_iva").eq("id", alta.organization_id).single()
    const esMonotributo = org?.condicion_iva === "Monotributo"
    const puntos = listaDePuntos(data)
    const sirve = (p: any) =>
      !p.deactivated && !p.blocked &&
      /web ?service/i.test(String(p.system)) &&
      (esMonotributo ? /monotributo/i.test(String(p.system)) : /rece/i.test(String(p.system)))

    const pedido = alta.punto_venta ? puntos.find((p) => Number(p.number) === alta.punto_venta) : undefined
    const existente = pedido && sirve(pedido) ? pedido : alta.punto_venta ? undefined : puntos.find(sirve)
    if (existente) return terminar(admin, alta, Number(existente.number))

    if (pedido) {
      throw new Error(`El punto de venta ${alta.punto_venta} ya existe en ARCA pero no es de facturación por web service. Elegí otro número.`)
    }
    const numero = alta.punto_venta || Math.max(0, ...puntos.map((p) => Number(p.number) || 0)) + 1
    return iniciarPaso(sdk, { ...alta, punto_venta: numero }, "punto_venta", clave, admin)
  }

  if (alta.paso === "punto_venta") {
    return terminar(admin, alta, alta.punto_venta!)
  }

  return alta
}

// Arranca la automatización de un paso. Necesita la clave fiscal, que no se guarda.
async function iniciarPaso(sdk: AfipSdk, alta: Alta, paso: Paso, clave: string, admin: any): Promise<Alta> {
  if (!clave) throw new Error("Falta la clave fiscal para continuar")
  const login = { cuit: alta.cuit, username: alta.usuario, password: clave }

  let automatizacion
  if (paso === "certificado") {
    automatizacion = await iniciarAutomatizacion(sdk, `create-cert-${alta.ambiente}`, { ...login, alias: alta.cert_alias })
  } else if (paso === "autorizacion") {
    automatizacion = await iniciarAutomatizacion(sdk, `auth-web-service-${alta.ambiente}`, {
      ...login, alias: alta.cert_alias, service: "wsfe",
    })
  } else if (paso === "puntos_venta") {
    automatizacion = await iniciarAutomatizacion(sdk, "list-sales-points", login)
  } else if (paso === "punto_venta") {
    const { data: org } = await admin.from("organizations").select("razon_social, condicion_iva").eq("id", alta.organization_id).single()
    automatizacion = await iniciarAutomatizacion(sdk, "create-sales-point", {
      ...login,
      numero: alta.punto_venta,
      // MAW = Factura Electrónica - Monotributo - Web Services · RAW = RECE para aplicativo y web services
      sistema: org?.condicion_iva === "Monotributo" ? "MAW" : "RAW",
      nombreFantasia: (org?.razon_social || "BG Gestión").slice(0, 50),
    })
  } else {
    return alta
  }
  return { ...alta, paso, estado: "en_curso", automatizacion_id: automatizacion.id, error: null }
}

async function terminar(admin: any, alta: Alta, puntoVenta: number): Promise<Alta> {
  const { error: credError } = await admin.from("fiscal_credentials")
    .update({ activo: true, updated_at: new Date().toISOString() })
    .eq("organization_id", alta.organization_id)
  if (credError) throw credError
  const { error } = await admin.from("organizations")
    .update({ fiscal_enabled: true, cuit: alta.cuit, punto_venta: puntoVenta })
    .eq("id", alta.organization_id)
  if (error) throw error
  return { ...alta, paso: "listo", estado: "listo", automatizacion_id: null, punto_venta: puntoVenta, error: null }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function listaDePuntos(data: any): any[] {
  if (Array.isArray(data)) return data
  for (const clave of ["sales_points", "salesPoints", "puntos", "data"]) {
    if (Array.isArray(data?.[clave])) return data[clave]
  }
  return []
}

function mensajeDeError(data: any): string {
  const msg = data?.message || data?.error || (typeof data === "string" ? data : "")
  return msg ? String(msg) : "ARCA no pudo completar el paso. Revisá el CUIT y la clave fiscal."
}

function resumen(alta: Alta) {
  return { paso: alta.paso, estado: alta.estado, error: alta.error, punto_venta: alta.punto_venta }
}

function soloDigitos(valor: unknown): string {
  return String(valor ?? "").replace(/\D/g, "")
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

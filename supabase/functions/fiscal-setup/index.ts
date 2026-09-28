// Edge Function: fiscal-setup
// Configuración fiscal de la organización y alta en ARCA con Afip SDK: con el CUIT y la clave
// fiscal del cliente se crea su propio certificado, se lo autoriza para facturar (wsfe) y se
// busca o crea su punto de venta. La clave fiscal se usa en cada paso y nunca se guarda.
// Si no quedan automatizaciones, el cliente hace esos trámites a mano en la página de ARCA
// (alta manual): acá se genera el pedido de certificado y después se verifica todo.

import { createClient } from "npm:@supabase/supabase-js@2"
import {
  type AfipSdk,
  AfipSdkError,
  type Ambiente,
  consultarAutomatizacion,
  iniciarAutomatizacion,
  obtenerTicketAcceso,
} from "../_shared/afipsdk.ts"
import { clavePublicaDelPedido, crearPedidoDeCertificado, leerCertificado, mismosBytes } from "../_shared/certificado.ts"
import { decryptSecret, encryptSecret } from "../_shared/crypto.ts"
import { usuarioDeLaSesion } from "../_shared/sesion.ts"
import { puntosDeVenta } from "../_shared/wsfe.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  // El navegador recuerda el permiso previo (preflight) y no lo vuelve a pedir en cada llamada
  "Access-Control-Max-Age": "86400",
}

// CUIT de prueba de Afip SDK: factura en homologación sin certificado propio
const CUIT_PRUEBA = "20409378472"

// En producción el alta arranca habilitando "Administración de Certificados Digitales" en la clave
// fiscal del cliente: sin ese servicio ARCA no deja crear el certificado.
// "manual": el cliente hace los trámites en la página de ARCA (ver manual_pedido y manual_verificar)
type Paso = "habilitar" | "certificado" | "autorizacion" | "puntos_venta" | "punto_venta" | "manual" | "listo"

interface Alta {
  organization_id: string
  cuit: string
  usuario: string
  ambiente: Ambiente
  paso: Paso
  estado: "en_curso" | "error" | "manual" | "listo"
  automatizacion_id: string | null
  cert_alias: string | null
  punto_venta: number | null
  error: string | null
  // Pedido de certificado del alta manual (no es secreto: la clave queda en fiscal_credentials)
  csr?: string | null
  // Registro técnico de cada paso (qué automatización, cuándo y qué respondió ARCA). No lo ve el cliente
  detalle?: Registro[]
}

interface Registro {
  fecha: string
  paso: Paso
  automatizacion?: string
  id?: string
  estado: string
  mensaje?: string
}

// Suma una entrada al registro del alta y la deja en el log de la función
function anotar(alta: Alta, entrada: Omit<Registro, "fecha">): Alta {
  const registro: Registro = { fecha: new Date().toISOString(), ...entrada }
  console.log(`Alta ARCA [${alta.organization_id}] CUIT ${alta.cuit}:`, JSON.stringify(registro))
  return { ...alta, detalle: [...(alta.detalle ?? []), registro].slice(-30) }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  try {
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return errorResponse("No autorizado", 401)

    const authId = await usuarioDeLaSesion(admin, authHeader)
    if (!authId) return errorResponse("No autorizado", 401)

    const { data: dbUser } = await admin
      .from("users")
      .select("id, full_name, email, organization_id, role")
      .eq("auth_id", authId)
      .single()

    if (!dbUser) return errorResponse("Usuario no encontrado", 404)

    const orgId: string = dbUser.organization_id
    const sdkPara = (ambiente: Ambiente): AfipSdk => ({ accessToken: Deno.env.get("AFIPSDK_ACCESS_TOKEN")!, ambiente })
    // Ambiente de las altas nuevas: 'dev' (modo prueba) o 'prod' (facturas reales)
    const leerAmbienteNuevo = async (): Promise<Ambiente> => {
      const { data } = await admin.from("fiscal_parametros").select("ambiente_nuevo").eq("id", 1).maybeSingle()
      return data?.ambiente_nuevo === "prod" ? "prod" : "dev"
    }

    const body = await req.json()
    const { action } = body

    // ── Configuración actual (cualquier usuario de la organización) ─────────
    if (action === "get_config") {
      const ambienteNuevo = await leerAmbienteNuevo()
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

    // La configuración de la facturación la cambia solo el dueño
    if (dbUser.role !== "owner") return errorResponse("Solo el dueño puede cambiar la configuración de facturación", 403)
    const autor = { created_by: dbUser.id, created_by_name: dbUser.full_name || dbUser.email }

    // ── Iniciar el alta: primer paso, crear el certificado del cliente ──────
    if (action === "alta_iniciar") {
      const cuit = soloDigitos(body.cuit)
      const usuario = soloDigitos(body.usuario) || cuit
      const clave: string = body.clave || ""
      if (cuit.length !== 11) return errorResponse("CUIT inválido (11 dígitos)")
      if (usuario.length !== 11) return errorResponse("CUIT/CUIL de ingreso a ARCA inválido (11 dígitos)")
      if (!clave) return errorResponse("Ingresá la clave fiscal")
      if (!body.razonSocial?.trim()) return errorResponse("Ingresá la razón social")
      if (!(await hayAutomatizaciones(admin))) return sinAutomatizaciones()

      const { error: orgError } = await admin.from("organizations").update({
        fiscal_enabled: false,
        cuit,
        razon_social: body.razonSocial.trim(),
        condicion_iva: body.condicionIva || "Monotributo",
        actividad_afip: body.actividadAfip || null,
      }).eq("id", orgId)
      if (orgError) throw orgError

      const ambienteNuevo = await leerAmbienteNuevo()
      const inicial: Alta = {
        organization_id: orgId,
        cuit,
        usuario,
        ambiente: ambienteNuevo,
        paso: "certificado",
        estado: "en_curso",
        automatizacion_id: null,
        cert_alias: `bg${Date.now().toString(36)}`,
        punto_venta: Number(body.puntoVenta) || null,
        error: null,
      }
      let alta: Alta
      try {
        alta = await iniciarPaso(sdkPara(ambienteNuevo), inicial, ambienteNuevo === "prod" ? "habilitar" : "certificado", clave, admin)
      } catch (err) {
        // Si habilitar el servicio no puede ni arrancar, se prueba directo con el certificado
        if (ambienteNuevo !== "prod" || !(err instanceof AfipSdkError) || esLimiteDeAutomatizaciones(err)) throw err
        const sinHabilitar = anotar(inicial, { paso: "habilitar", automatizacion: "add-relation", estado: "no arrancó", mensaje: err.message })
        alta = await iniciarPaso(sdkPara(ambienteNuevo), sinHabilitar, "certificado", clave, admin)
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

      // Lo que respondió ARCA queda en el registro del alta (sin el certificado ni la clave)
      const conRegistro = anotar(alta, {
        paso: alta.paso,
        id: alta.automatizacion_id,
        estado: automatizacion.status,
        mensaje: automatizacion.status === "error" ? detalleDeError(automatizacion.data) : "ok",
      })

      let siguiente: Alta
      if (automatizacion.status === "error" && alta.paso === "habilitar" && !esErrorDeClave(automatizacion.data)) {
        // Puede que el servicio ya estuviera habilitado: se sigue con el certificado
        try {
          siguiente = await iniciarPaso(sdk, conRegistro, "certificado", body.clave || "", admin)
        } catch (err) {
          siguiente = { ...conRegistro, estado: "error", error: await errorDelPaso(admin, err) }
        }
      } else if (automatizacion.status === "error") {
        siguiente = { ...conRegistro, estado: "error", error: mensajeDeErrorDelAlta(conRegistro, automatizacion.data) }
      } else {
        try {
          siguiente = await procesarPaso(admin, sdk, conRegistro, automatizacion.data, body.clave || "")
        } catch (err) {
          siguiente = { ...conRegistro, estado: "error", error: await errorDelPaso(admin, err) }
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
      if (!(await hayAutomatizaciones(admin))) return sinAutomatizaciones()
      if (body.puntoVenta) alta.punto_venta = Number(body.puntoVenta)
      // Un certificado nuevo va con otro alias, por si ARCA llegó a registrar el anterior
      if (alta.paso === "certificado") alta.cert_alias = `bg${Date.now().toString(36)}`

      // En producción, reintentar el certificado vuelve a habilitar antes el servicio de certificados:
      // es lo que suele faltar cuando el certificado falla
      const paso: Paso = alta.paso === "certificado" && alta.ambiente === "prod" ? "habilitar" : alta.paso
      let siguiente: Alta
      try {
        siguiente = await iniciarPaso(sdkPara(alta.ambiente), alta, paso, body.clave, admin)
      } catch (err) {
        if (paso !== "habilitar" || !(err instanceof AfipSdkError) || esLimiteDeAutomatizaciones(err)) throw err
        const sinHabilitar = anotar(alta, { paso: "habilitar", automatizacion: "add-relation", estado: "no arrancó", mensaje: err.message })
        siguiente = await iniciarPaso(sdkPara(alta.ambiente), sinHabilitar, "certificado", body.clave, admin)
      }
      const { error } = await admin.from("fiscal_onboarding")
        .update({ ...siguiente, updated_at: new Date().toISOString() })
        .eq("organization_id", orgId)
      if (error) throw error
      return jsonResponse({ ok: true, alta: resumen(siguiente) })
    }

    if (action === "alta_cancelar") {
      await admin.from("fiscal_onboarding").delete().eq("organization_id", orgId)
      // Un certificado a medio tramitar no sirve: se borra (el de una conexión activa, no)
      await admin.from("fiscal_credentials").delete().eq("organization_id", orgId).eq("activo", false)
      return jsonResponse({ ok: true })
    }

    // ── Alta a mano, cuando no quedan automatizaciones ──────────────────────
    // 1) manual_pedido: se genera la clave (queda en el servidor) y el pedido de certificado que el
    //    cliente sube en ARCA. 2) El cliente crea el certificado, lo autoriza para facturar y crea el
    //    punto de venta en la página de ARCA. 3) manual_verificar: sube el certificado, se prueba con
    //    ARCA y queda conectado. No usa la clave fiscal.
    if (action === "manual_pedido") {
      const cuit = soloDigitos(body.cuit)
      const razonSocial = String(body.razonSocial ?? "").trim()
      if (cuit.length !== 11) return errorResponse("El CUIT tiene que tener 11 dígitos")
      if (!razonSocial) return errorResponse("Ingresá la razón social")
      if (await leerAmbienteNuevo() !== "prod") return errorResponse("En modo prueba usá \"Probar sin clave fiscal\"")
      const condicionIva = ["Monotributo", "RI", "Exento"].includes(body.condicionIva) ? body.condicionIva : "Monotributo"

      const { error: orgError } = await admin.from("organizations")
        .update({ fiscal_enabled: false, cuit, razon_social: razonSocial, condicion_iva: condicionIva })
        .eq("id", orgId)
      if (orgError) throw orgError

      // Si ya hay un pedido para este CUIT se devuelve el mismo, salvo que se pida empezar de nuevo
      const { data: previa } = await admin.from("fiscal_onboarding").select("*").eq("organization_id", orgId).maybeSingle()
      if (previa?.estado === "manual" && previa.cuit === cuit && previa.csr && !body.nuevo) {
        return jsonResponse({ ok: true, alta: resumen(previa), csr: previa.csr })
      }

      // Nombre del certificado en ARCA: solo letras y números
      const alias = `bggestion${100 + Math.floor(Math.random() * 900)}`
      const pedido = await crearPedidoDeCertificado({ cuit, razonSocial, alias })
      const { error: credError } = await admin.from("fiscal_credentials").upsert({
        organization_id: orgId,
        cuit,
        ambiente: "prod",
        cert_alias: alias,
        cert_encrypted: null,
        key_encrypted: await encryptSecret(pedido.clave, Deno.env.get("FISCAL_CERTS_ENCRYPTION_KEY")!),
        activo: false,
        ta_token: null,
        ta_sign: null,
        ta_expira: null,
        updated_at: new Date().toISOString(),
      })
      if (credError) throw credError

      const alta = anotar({
        organization_id: orgId,
        cuit,
        usuario: cuit,
        ambiente: "prod",
        paso: "manual",
        estado: "manual",
        automatizacion_id: null,
        cert_alias: alias,
        punto_venta: null,
        error: null,
        csr: pedido.csr,
        detalle: previa?.detalle ?? [],
      }, { paso: "manual", estado: "pedido de certificado", mensaje: alias })
      const { error } = await admin.from("fiscal_onboarding").upsert({ ...alta, updated_at: new Date().toISOString() })
      if (error) throw error
      return jsonResponse({ ok: true, alta: resumen(alta), csr: pedido.csr })
    }

    if (action === "manual_verificar") {
      const [{ data: alta }, { data: cred }] = await Promise.all([
        admin.from("fiscal_onboarding").select("*").eq("organization_id", orgId).maybeSingle(),
        admin.from("fiscal_credentials").select("key_encrypted").eq("organization_id", orgId).maybeSingle(),
      ])
      if (alta?.estado !== "manual" || !alta.csr || !cred?.key_encrypted) {
        return errorResponse("Primero descargá el archivo para ARCA (paso 1)")
      }
      const puntoVenta = Number(body.puntoVenta)
      if (!Number.isInteger(puntoVenta) || puntoVenta < 1 || puntoVenta > 99998) {
        return errorDelAltaManual(4, "Escribí el número del punto de venta que creaste en el trámite 4.")
      }

      // 1. Tiene que ser el certificado del pedido que generamos (trámite 2)
      let certificado
      try {
        certificado = leerCertificado(Uint8Array.from(atob(String(body.certificado ?? "")), (c) => c.charCodeAt(0)))
      } catch {
        return errorDelAltaManual(2, "Ese archivo no es un certificado. Subí el que descargaste de ARCA al final del trámite 2 (con \"Ver\" y después \"Descargar\").")
      }
      if (!mismosBytes(certificado.clavePublica, clavePublicaDelPedido(alta.csr))) {
        return errorDelAltaManual(2, `Ese certificado no es el que se creó con el archivo de BG Gestión. En ARCA, descargá el certificado del alias "${alta.cert_alias}".`)
      }
      if (certificado.vence.getTime() < Date.now()) {
        return errorDelAltaManual(2, "Ese certificado está vencido. Volvé a empezar para crear uno nuevo.")
      }
      const llave = Deno.env.get("FISCAL_CERTS_ENCRYPTION_KEY")!
      const clave = await decryptSecret(cred.key_encrypted, llave)
      const { error: certError } = await admin.from("fiscal_credentials")
        .update({ cert_encrypted: await encryptSecret(certificado.pem, llave), updated_at: new Date().toISOString() })
        .eq("organization_id", orgId)
      if (certError) throw certError

      // 2. ARCA tiene que dejar usar el certificado para facturar (trámite 3)
      const sdk = sdkPara("prod")
      let ticket
      try {
        ticket = await obtenerTicketAcceso(sdk, { cuit: alta.cuit, wsid: "wsfe", cert: certificado.pem, key: clave })
      } catch (err) {
        if (!(err instanceof AfipSdkError)) throw err
        console.error(`Alta manual [${orgId}]: ARCA no dio el ticket de acceso:`, err.status, err.message, JSON.stringify(err.body))
        if (/not ?authorized|no autorizad|no est[aá] autorizad/i.test(err.message)) {
          return errorDelAltaManual(3, `ARCA todavía no autorizó el certificado para facturar. Revisá el trámite 3: la relación con "Facturación Electrónica" tiene que tener el certificado "${alta.cert_alias}".`)
        }
        if (/cert/i.test(err.message)) {
          return errorDelAltaManual(2, "ARCA no reconoce el certificado. Subí el que descargaste en el trámite 2.")
        }
        return errorResponse("No pudimos comunicarnos con ARCA. Probá de nuevo en unos minutos.", 502)
      }
      const auth = { Token: ticket.token, Sign: ticket.sign, Cuit: alta.cuit }

      // 3. El punto de venta tiene que estar habilitado para facturar por sistema (trámite 4).
      //    Si ARCA no devuelve la lista, se acepta: si hubiera un error, lo dice la primera factura
      try {
        const habilitados = (await puntosDeVenta(sdk, auth)).filter((p) => !p.bloqueado && !p.deBaja)
        if (habilitados.length && !habilitados.some((p) => p.numero === puntoVenta)) {
          return errorDelAltaManual(4, `El punto de venta ${puntoVenta} no está habilitado para facturar desde un sistema. Los que tenés habilitados son: ${habilitados.map((p) => p.numero).join(", ")}. Si lo acabás de crear, esperá unos minutos y probá de nuevo.`)
        }
        if (!habilitados.length) console.log(`Alta manual [${orgId}]: ARCA no listó puntos de venta; se acepta el ${puntoVenta}`)
      } catch (err) {
        console.error(`Alta manual [${orgId}]: no se pudieron consultar los puntos de venta:`, (err as Error).message)
      }

      // 4. Listo: queda conectado, con el ticket de acceso ya guardado
      const { error: taError } = await admin.from("fiscal_credentials")
        .update({ ta_token: ticket.token, ta_sign: ticket.sign, ta_expira: ticket.expiration })
        .eq("organization_id", orgId)
      if (taError) throw taError
      const terminado = await terminar(admin, anotar(alta, { paso: "manual", estado: "verificado", mensaje: `punto de venta ${puntoVenta}` }), puntoVenta)
      const { error } = await admin.from("fiscal_onboarding")
        .update({ ...terminado, updated_at: new Date().toISOString() })
        .eq("organization_id", orgId)
      if (error) throw error
      return jsonResponse({ ok: true, alta: resumen(terminado) })
    }

    // ── Probar sin clave fiscal: CUIT de prueba de Afip SDK (solo en modo prueba) ─
    if (action === "usar_cuit_prueba") {
      if (await leerAmbienteNuevo() !== "dev") return errorResponse("El CUIT de prueba solo existe en modo prueba")
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
        razon_social: "Empresa de prueba",
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

    // ── Remitos R: CAI de ARCA ──────────────────────────────────────────────
    // Pedir el CAI: el cliente solo indica cuántos remitos quiere. El sistema usa el punto de
    // venta de un CAI anterior o busca (y si no hay, crea) uno "Factuweb (Imprenta)", que ARCA
    // exige para pedir CAI, y después pide el CAI. Cada paso usa la clave fiscal, que no se guarda.
    // Es un trámite real en ARCA: no existe CAI de homologación.
    if (action === "cai_solicitar") {
      const cantidad = Number(body.cantidad)
      if (!body.clave) return errorResponse("Ingresá la clave fiscal")
      if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 10000) return errorResponse("Cantidad inválida (entre 1 y 10.000)")
      if (!(await hayAutomatizaciones(admin))) return sinAutomatizaciones()

      const { data: org } = await admin.from("organizations").select("cuit, razon_social, condicion_iva").eq("id", orgId).single()
      if (!org?.cuit) return errorResponse("Primero configurá la facturación electrónica para poder pedir el CAI")

      const { data: anterior } = await admin.from("remitos_cai")
        .select("punto_venta")
        .eq("organization_id", orgId).not("punto_venta", "is", null).neq("estado", "error")
        .order("created_at", { ascending: false }).limit(1).maybeSingle()

      const pedido: PedidoCai = { organization_id: orgId, punto_venta: anterior?.punto_venta ?? null, cantidad }
      const primerPaso = pedido.punto_venta ? "cai" : "puntos_venta"
      const inicio = await iniciarPasoCai(admin, sdkPara("prod"), org, pedido, primerPaso, body)
      const { data: fila, error } = await admin.from("remitos_cai").insert({
        ...pedido,
        ...inicio,
        origen: "automatico",
        ...autor,
        estado: "pendiente",
      }).select("*").single()
      if (error) throw error
      return jsonResponse({ ok: true, cai: fila })
    }

    // Seguir el pedido del CAI: la app lo llama cada pocos segundos (con la clave) hasta terminar
    if (action === "cai_avanzar") {
      const { data: fila } = await admin.from("remitos_cai").select("*").eq("id", body.id).eq("organization_id", orgId).single()
      if (!fila) return errorResponse("No se encontró el pedido de CAI")
      if (fila.estado !== "pendiente" || !fila.automatizacion_id) return jsonResponse({ ok: true, cai: fila })

      const sdk = sdkPara("prod")
      const automatizacion = await consultarAutomatizacion(sdk, fila.automatizacion_id)
      if (automatizacion.status !== "complete" && automatizacion.status !== "error") return jsonResponse({ ok: true, cai: fila })

      let cambios: Record<string, unknown>
      if (automatizacion.status === "error") {
        cambios = { estado: "error", paso: null, error: mensajeDeError(automatizacion.data) }
      } else {
        try {
          cambios = await procesarPasoCai(admin, sdk, orgId, fila, automatizacion.data, body)
        } catch (err) {
          cambios = { estado: "error", paso: null, error: await errorDelPaso(admin, err) }
        }
      }
      const { data: actualizada, error } = await admin.from("remitos_cai").update(cambios).eq("id", fila.id).select("*").single()
      if (error) throw error
      return jsonResponse({ ok: true, cai: actualizada })
    }

    // Cargar a mano un CAI ya otorgado (por ejemplo, tramitado por el contador)
    if (action === "cai_cargar") {
      const cai = soloDigitos(body.cai)
      const puntoVenta = Number(body.puntoVenta)
      const desde = Number(body.desde)
      const hasta = Number(body.hasta)
      if (cai.length !== 14) return errorResponse("El CAI tiene 14 dígitos")
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.vencimiento || "")) return errorResponse("Ingresá la fecha de vencimiento del CAI")
      if (!Number.isInteger(puntoVenta) || puntoVenta < 1) return errorResponse("Punto de venta inválido")
      if (!Number.isInteger(desde) || !Number.isInteger(hasta) || desde < 1 || hasta < desde) {
        return errorResponse("Revisá la numeración autorizada (desde y hasta)")
      }
      const { data: fila, error } = await admin.from("remitos_cai").insert({
        organization_id: orgId,
        punto_venta: puntoVenta,
        cai,
        vencimiento: body.vencimiento,
        desde,
        hasta,
        origen: "manual",
        ...autor,
        estado: "vigente",
      }).select("*").single()
      if (error) throw error
      return jsonResponse({ ok: true, cai: fila })
    }

    // Borrar un CAI (solo si ningún remito lo usó)
    if (action === "cai_borrar") {
      const { data: fila } = await admin.from("remitos_cai").select("id, cai").eq("id", body.id).eq("organization_id", orgId).single()
      if (!fila) return errorResponse("No se encontró el CAI")
      if (fila.cai) {
        const { count } = await admin.from("remitos").select("id", { count: "exact", head: true })
          .eq("organization_id", orgId).eq("cai", fila.cai)
        if (count) return errorResponse("Hay remitos emitidos con este CAI: no se puede borrar")
      }
      await admin.from("remitos_cai").delete().eq("id", fila.id)
      return jsonResponse({ ok: true })
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
    // Se terminaron las automatizaciones: la app muestra cómo hacer el trámite a mano
    if (esLimiteDeAutomatizaciones(err)) {
      await marcarSinAutomatizaciones(admin)
      return sinAutomatizaciones()
    }
    return errorResponse(mensajeParaCliente(err), 500)
  }
})

// ─── Pasos del alta ──────────────────────────────────────────────────────────

// Procesa el resultado de la automatización del paso actual y arranca la del siguiente
async function procesarPaso(admin: any, sdk: AfipSdk, alta: Alta, data: any, clave: string): Promise<Alta> {
  if (alta.paso === "habilitar") {
    return iniciarPaso(sdk, alta, "certificado", clave, admin)
  }

  if (alta.paso === "certificado") {
    if (!data?.cert || !data?.key) {
      console.error("create-cert sin cert/key:", JSON.stringify(data))
      throw new Error("ARCA no devolvió el certificado. Probá de nuevo.")
    }
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
  if (paso === "habilitar") {
    // Habilita "Administración de Certificados Digitales" para quien entra a ARCA. La automatización
    // se llama "add-relation" (en la documentación figura como enable-cert-prod-admin)
    automatizacion = await iniciarAutomatizacion(sdk, "add-relation", {
      ...login, service: "web://arfe_certificado", delegate_to: alta.usuario,
    })
  } else if (paso === "certificado") {
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
  const registrada = anotar(alta, { paso, automatizacion: NOMBRES_AUTOMATIZACION[paso](alta.ambiente), id: automatizacion.id, estado: "iniciada" })
  return { ...registrada, paso, estado: "en_curso", automatizacion_id: automatizacion.id, error: null }
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

// Primer número del próximo CAI: sigue al último rango pedido para ese punto de venta o, si no
// hay, al último remito R emitido. ARCA numera los CAI de un punto de venta en forma correlativa.
async function siguienteNumeroCai(admin: any, orgId: string, puntoVenta: number): Promise<number> {
  const { data: ultimoCai } = await admin.from("remitos_cai")
    .select("hasta")
    .eq("organization_id", orgId).eq("punto_venta", puntoVenta).neq("estado", "error")
    .order("hasta", { ascending: false }).limit(1).maybeSingle()
  if (ultimoCai) return Number(ultimoCai.hasta) + 1
  const { data: ultimoRemito } = await admin.from("remitos")
    .select("numero")
    .eq("organization_id", orgId).eq("tipo", "R").eq("punto_venta", puntoVenta)
    .order("numero", { ascending: false }).limit(1).maybeSingle()
  return ultimoRemito ? Number(ultimoRemito.numero) + 1 : 1
}

// "31/12/2026" → "2026-12-31" (si ya viene como YYYY-MM-DD, queda igual)
function fechaIso(fecha: string): string {
  const partes = fecha.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return partes ? `${partes[3]}-${partes[2]}-${partes[1]}` : fecha.slice(0, 10)
}

function listaDePuntos(data: any): any[] {
  if (Array.isArray(data)) return data
  for (const clave of ["sales_points", "salesPoints", "puntos", "data"]) {
    if (Array.isArray(data?.[clave])) return data[clave]
  }
  return []
}

// ─── Pedido de CAI para remitos R ────────────────────────────────────────────

interface PedidoCai {
  organization_id: string
  punto_venta: number | null
  cantidad: number
}

type PasoCai = "puntos_venta" | "punto_venta" | "cai"

// Arranca la automatización de un paso del pedido de CAI. Necesita la clave fiscal.
async function iniciarPasoCai(
  admin: any,
  sdk: AfipSdk,
  org: { cuit: string; razon_social: string | null; condicion_iva: string | null },
  pedido: PedidoCai,
  paso: PasoCai,
  credenciales: { clave?: string; usuario?: string },
): Promise<Record<string, unknown>> {
  if (!credenciales.clave) throw new Error("Falta la clave fiscal para continuar")
  const login = { cuit: org.cuit, username: soloDigitos(credenciales.usuario) || org.cuit, password: credenciales.clave }

  if (paso === "puntos_venta") {
    const automatizacion = await iniciarAutomatizacion(sdk, "list-sales-points", login)
    return { paso, automatizacion_id: automatizacion.id }
  }
  if (paso === "punto_venta") {
    // II = Factuweb (Imprenta) - Responsable Inscripto · IM = Factuweb (Imprenta) - Monotributo
    const automatizacion = await iniciarAutomatizacion(sdk, "create-sales-point", {
      ...login,
      numero: pedido.punto_venta,
      sistema: org.condicion_iva === "Monotributo" ? "IM" : "II",
      nombreFantasia: "Remitos",
    })
    return { paso, automatizacion_id: automatizacion.id }
  }

  const desde = await siguienteNumeroCai(admin, pedido.organization_id, pedido.punto_venta!)
  const automatizacion = await iniciarAutomatizacion(sdk, "cai-request", {
    ...login,
    comprobantes: [{ puntoVenta: pedido.punto_venta, tipoComprobante: 91, cantidad: pedido.cantidad }], // 91 = Remito R
    resguardo: false,
    autorizados: [{ tipoDocumento: 80, documento: org.cuit, denominacion: (org.razon_social || "").slice(0, 50) }],
    validateOnly: false,
  })
  return { paso, automatizacion_id: automatizacion.id, desde, hasta: desde + pedido.cantidad - 1 }
}

// Procesa el resultado del paso actual y arranca el siguiente (o deja el CAI vigente)
async function procesarPasoCai(admin: any, sdk: AfipSdk, orgId: string, fila: any, data: any, credenciales: { clave?: string; usuario?: string }) {
  const { data: org } = await admin.from("organizations").select("cuit, razon_social, condicion_iva").eq("id", orgId).single()
  const pedido: PedidoCai = { organization_id: orgId, punto_venta: fila.punto_venta, cantidad: fila.cantidad }

  if (fila.paso === "puntos_venta") {
    // Punto de venta de comprobantes impresos ya existente; si no hay, se crea el siguiente número libre
    const puntos = listaDePuntos(data)
    const imprenta = puntos.find(p => !p.deactivated && !p.blocked && /imprenta/i.test(String(p.system)))
    if (imprenta) {
      pedido.punto_venta = Number(imprenta.number)
      return { punto_venta: pedido.punto_venta, ...(await iniciarPasoCai(admin, sdk, org, pedido, "cai", credenciales)) }
    }
    pedido.punto_venta = Math.max(0, ...puntos.map(p => Number(p.number) || 0)) + 1
    return { punto_venta: pedido.punto_venta, ...(await iniciarPasoCai(admin, sdk, org, pedido, "punto_venta", credenciales)) }
  }

  if (fila.paso === "punto_venta") {
    return await iniciarPasoCai(admin, sdk, org, pedido, "cai", credenciales)
  }

  const cai = soloDigitos(data?.cai)
  if (cai.length !== 14) {
    console.error("cai-request sin CAI:", JSON.stringify(data))
    return { estado: "error", paso: null, error: "ARCA no otorgó el CAI. Probá de nuevo más tarde." }
  }
  return { estado: "vigente", paso: null, cai, vencimiento: fechaIso(String(data.vencimiento)), error: null }
}

// ─── Sin automatizaciones ────────────────────────────────────────────────────
// Afip SDK corta cuando se usan todas las automatizaciones del plan: "Alcanzaste el límite de
// automatizaciones que podés usar en este período...". Se anota cuándo pasó y, por un día, la app
// muestra cómo hacer el alta y el CAI a mano en la página de ARCA. Pasado ese tiempo se vuelve a
// probar solo; si se contrata el adicional antes, alcanza con borrar la marca en fiscal_parametros.

const LIMITE_AUTOMATIZACIONES = /l[íi]mite de automatizaciones|afipsdk\.com\/billing/i
const HORAS_SIN_AUTOMATIZACIONES = 24

function esLimiteDeAutomatizaciones(err: unknown): boolean {
  return err instanceof AfipSdkError && LIMITE_AUTOMATIZACIONES.test(`${err.message} ${JSON.stringify(err.body ?? "")}`)
}

async function marcarSinAutomatizaciones(admin: any) {
  console.error("Afip SDK: no quedan automatizaciones en el plan. Altas y CAI pasan a hacerse a mano por", HORAS_SIN_AUTOMATIZACIONES, "horas")
  await admin.from("fiscal_parametros").update({ automatizaciones_agotadas: new Date().toISOString() }).eq("id", 1)
}

async function hayAutomatizaciones(admin: any): Promise<boolean> {
  const { data } = await admin.from("fiscal_parametros").select("automatizaciones_agotadas").eq("id", 1).maybeSingle()
  const agotadas = data?.automatizaciones_agotadas ? new Date(data.automatizaciones_agotadas).getTime() : 0
  return Date.now() - agotadas > HORAS_SIN_AUTOMATIZACIONES * 3600_000
}

// La app reconoce el código y muestra el paso a paso para hacerlo en la página de ARCA. El mensaje
// solo lo ven las versiones anteriores de la app, que no tienen el paso a paso
const ACTUALIZAR_PARA_PASO_A_PASO = "Actualizá BG Gestión a la última versión para ver el paso a paso y hacerlo en la página de ARCA."

function sinAutomatizaciones() {
  return jsonResponse({
    ok: false,
    codigo: "sin_automatizaciones",
    error: `En este momento no podemos hacer este trámite automáticamente. ${ACTUALIZAR_PARA_PASO_A_PASO}`,
  })
}

// Error al arrancar el paso siguiente de un alta o un pedido de CAI en curso
async function errorDelPaso(admin: any, err: unknown): Promise<string> {
  if (!esLimiteDeAutomatizaciones(err)) return mensajeParaCliente(err)
  await marcarSinAutomatizaciones(admin)
  return `No se pudo terminar automáticamente. ${ACTUALIZAR_PARA_PASO_A_PASO}`
}

// Error del alta manual: `tramite` le indica a la app qué paso revisar
function errorDelAltaManual(tramite: number, mensaje: string) {
  return jsonResponse({ ok: false, error: mensaje, tramite }, 400)
}

// ─── Mensajes para el cliente ────────────────────────────────────────────────
// Los detalles técnicos van al log de la función; al cliente se le muestra algo claro.

function mensajeParaCliente(err: unknown): string {
  if (err instanceof AfipSdkError) {
    console.error("Afip SDK:", err.status, err.message, JSON.stringify(err.body))
    return "No pudimos comunicarnos con ARCA. Probá de nuevo en unos minutos."
  }
  const mensaje = (err as Error)?.message
  console.error("fiscal-setup error:", mensaje)
  return mensaje || "Ocurrió un error. Probá de nuevo."
}

const NOMBRES_AUTOMATIZACION: Record<Paso, (ambiente: Ambiente) => string> = {
  habilitar: () => "add-relation",
  certificado: (ambiente) => `create-cert-${ambiente}`,
  autorizacion: (ambiente) => `auth-web-service-${ambiente}`,
  puntos_venta: () => "list-sales-points",
  punto_venta: () => "create-sales-point",
  manual: () => "",
  listo: () => "",
}

// ARCA no respondió (páginas que no abren, servidores congestionados)
const ARCA_NO_RESPONDE = /congestionad|intente nuevamente|no fue posible abrir|no responde|tiempo de espera|timeout/i

// Mensaje del paso que falló, teniendo en cuenta lo que pasó antes en el mismo intento: si el
// certificado falla por falta del servicio y habilitarlo falló porque ARCA no respondía, la causa es ARCA
function mensajeDeErrorDelAlta(alta: Alta, data: any): string {
  const detalle = detalleDeError(data)
  const habilitar = [...(alta.detalle ?? [])].reverse().find((r) => r.paso === "habilitar" && r.estado !== "iniciada")
  if (/Administraci[oó]n de Certificados Digitales/i.test(detalle) && habilitar?.estado === "error" && ARCA_NO_RESPONDE.test(habilitar.mensaje ?? "")) {
    console.error("Alta ARCA: el certificado falló porque ARCA no dejó habilitar el servicio:", habilitar.mensaje)
    return "No se pudo completar porque ARCA no está respondiendo: no abre el \"Administrador de Relaciones de Clave Fiscal\", que hace falta para habilitar los certificados. Probá de nuevo en unos minutos. Si sigue igual, revisá que tu clave fiscal sea nivel 3."
  }
  return mensajeDeError(data)
}

function detalleDeError(data: any): string {
  return String(data?.message || data?.error || (typeof data === "string" ? data : ""))
}

const ERROR_DE_CLAVE = /contraseñ|password|clave|credencial|login|incorrect|invalid/i
const ERROR_DE_NIVEL = /nivel|level/i

// El ingreso a ARCA falló (CUIT o clave mal escritos, o clave de nivel bajo): no se sigue, porque
// cada intento fallido cuenta para el bloqueo de la clave fiscal. Es más estricto que ERROR_DE_CLAVE
// para no confundirlo con otros avisos que mencionan la clave, como "el servicio ya está habilitado"
function esErrorDeClave(data: any): boolean {
  const detalle = detalleDeError(data)
  return /(contraseñ|clave|usuario|cuit)[^.]{0,40}(incorrect|inválid|invalid|erróne|errone)|(incorrect|invalid)[^.]{0,20}(password|credential)|nivel/i
    .test(detalle)
}

// Error de una automatización en la página de ARCA
function mensajeDeError(data: any): string {
  const detalle = detalleDeError(data)
  console.error("Automatización con error:", detalle || JSON.stringify(data))
  // Falta el servicio de certificados en la clave fiscal (y ARCA no dejó habilitarlo solo)
  if (/Administraci[oó]n de Certificados Digitales/i.test(detalle)) {
    return "Tu clave fiscal todavía no tiene el servicio \"Administración de Certificados Digitales\". Tocá Reintentar para que lo habilitemos. Si vuelve a fallar, agregalo en la página de ARCA desde \"Administrador de Relaciones de Clave Fiscal\" → \"Adherir servicio\" y después reintentá."
  }
  if (ARCA_NO_RESPONDE.test(detalle)) {
    return "ARCA no está respondiendo en este momento. Probá de nuevo en unos minutos."
  }
  if (ERROR_DE_CLAVE.test(detalle)) return "El CUIT o la clave fiscal no son correctos."
  if (ERROR_DE_NIVEL.test(detalle)) return "Tu clave fiscal tiene que ser nivel 3 o superior."
  // Los mensajes de ARCA en castellano se muestran tal cual
  if (/[áéíóúñ]/i.test(detalle) && !/error:|exception|stack/i.test(detalle)) return detalle
  return "ARCA no pudo completar este paso. Revisá el CUIT y la clave fiscal e intentá de nuevo."
}

function resumen(alta: Alta) {
  return { paso: alta.paso, estado: alta.estado, error: alta.error, punto_venta: alta.punto_venta, cert_alias: alta.cert_alias }
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

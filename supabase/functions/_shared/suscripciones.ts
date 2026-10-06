// Suscripciones de los clientes a Binary Goats (hoy: plan BG Tienda). Distinto de
// _shared/mercadopago.ts, que maneja la cuenta de Mercado Pago de cada tienda para cobrarle a SUS
// compradores: acá se usa la cuenta de Binary Goats (MP_SUBS_ACCESS_TOKEN) y la plata entra ahí.
//
// sincronizarSuscripcion() es la única fuente de verdad: lee el estado directo de la API de
// Mercado Pago y lo aplica a la base. La llaman el webhook (suscripciones-webhook) y la página de
// bienvenida (estado-alta), así una cuenta se activa aunque un aviso de Mercado Pago se pierda, y
// un aviso falso no puede activar nada porque nunca se confía en su contenido.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2"
import { sendEmail } from "./email.ts"

const MP_API = "https://api.mercadopago.com"
const OWNER_EMAIL_DEFAULT = "binarygoatsinformatic@gmail.com"

export interface Suscripcion {
  id: string
  organization_id: string
  product: string
  plan: string
  mp_preapproval_id: string | null
  mp_status: string | null
  first_amount: number
  full_amount: number
  current_amount: number
  first_paid_at: string | null
  last_paid_at: string | null
  next_payment_date: string | null
  past_due_since: string | null
  cancelled_at: string | null
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  payer_email: string | null
  last_synced_at: string | null
}

interface Organizacion {
  id: string
  name: string
  slug: string
  plan: string
  subscription_status: string | null
  subscription_ends_at: string | null
}

// Factura mensual de una suscripción (GET /authorized_payments/{id}).
interface CobroMP {
  id: number | string
  preapproval_id: string
  status: string // scheduled / processed / recycling / cancelled
  transaction_amount: number | string
  debit_date: string | null
  retry_attempt: number | null
  external_reference?: string | null
  payment?: { id: number | string | null; status: string | null; status_detail: string | null } | null
}

export function precioPrimerMes(precioLista: number): number {
  return Math.round(precioLista * 0.5)
}

export async function mpFetch(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: any }> {
  const token = Deno.env.get("MP_SUBS_ACCESS_TOKEN")
  if (!token) throw new Error("Falta configurar MP_SUBS_ACCESS_TOKEN")
  const res = await fetch(`${MP_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  })
  const data = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, data }
}

// Código de acceso al panel después de pagar (ver alta-tienda y estado-alta). Se guarda solo el
// hash: el código queda en el navegador de quien hizo el alta.
const ACCESO_VALIDO_MS = 24 * 60 * 60 * 1000

export async function generarAcceso(): Promise<{ codigo: string; hash: string; venceAt: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const codigo = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
  return { codigo, hash: await hashAcceso(codigo), venceAt: new Date(Date.now() + ACCESO_VALIDO_MS).toISOString() }
}

export async function hashAcceso(codigo: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codigo))
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

export function storeSiteUrl(): string {
  return (Deno.env.get("ECOMERSE_SITE_URL") ?? "https://bg-tienda.vercel.app").replace(/\/$/, "")
}

// ─── Sincronización ──────────────────────────────────────────────────────────

export async function sincronizarSuscripcion(
  admin: SupabaseClient,
  ref: { organizationId?: string; preapprovalId?: string; authorizedPaymentId?: string },
): Promise<{ status: string | null } | null> {
  let preapprovalId = ref.preapprovalId ?? null
  const cobros = new Map<string, CobroMP>()

  if (ref.authorizedPaymentId) {
    const r = await mpFetch(`/authorized_payments/${encodeURIComponent(ref.authorizedPaymentId)}`)
    if (!r.ok) throw new Error(`No se pudo consultar el cobro ${ref.authorizedPaymentId} (${r.status})`)
    cobros.set(String(r.data.id), r.data)
    preapprovalId = r.data.preapproval_id ?? preapprovalId
  }

  let sub: Suscripcion | null = null
  if (preapprovalId) {
    const { data } = await admin.from("platform_subscriptions").select("*").eq("mp_preapproval_id", preapprovalId).maybeSingle()
    sub = data
  } else if (ref.organizationId) {
    const { data } = await admin.from("platform_subscriptions").select("*").eq("organization_id", ref.organizationId).maybeSingle()
    sub = data
    preapprovalId = sub?.mp_preapproval_id ?? null
  }
  if (!preapprovalId) return null

  const pre = await mpFetch(`/preapproval/${encodeURIComponent(preapprovalId)}`)
  if (!pre.ok) throw new Error(`No se pudo consultar la suscripción ${preapprovalId} (${pre.status})`)

  // La suscripción se guarda apenas Mercado Pago la crea; si igual no está (el alta se cortó
  // justo entre crearla y guardarla), se busca por external_reference = id de la organización.
  if (!sub && pre.data?.external_reference) {
    const { data } = await admin
      .from("platform_subscriptions")
      .select("*")
      .eq("organization_id", pre.data.external_reference)
      .is("mp_preapproval_id", null)
      .maybeSingle()
    if (data) {
      await admin.from("platform_subscriptions").update({ mp_preapproval_id: preapprovalId }).eq("id", data.id)
      sub = { ...data, mp_preapproval_id: preapprovalId }
    }
  }
  if (!sub) {
    // Suscripción vieja de una cuenta que se reactivó con una nueva (reactivar-suscripcion): sus
    // avisos ya no cambian nada, no es un pago huérfano.
    if (pre.data?.external_reference) {
      const { data: actual } = await admin
        .from("platform_subscriptions")
        .select("id")
        .eq("organization_id", pre.data.external_reference)
        .maybeSingle()
      if (actual) return null
    }
    await avisarSuscripcionHuerfana(preapprovalId, pre.data)
    return null
  }

  const { data: org } = await admin
    .from("organizations")
    .select("id, name, slug, plan, subscription_status, subscription_ends_at")
    .eq("id", sub.organization_id)
    .single<Organizacion>()
  if (!org) return null

  const busqueda = await mpFetch(`/authorized_payments/search?preapproval_id=${encodeURIComponent(preapprovalId)}`)
  if (busqueda.ok) {
    for (const c of (busqueda.data?.results ?? []) as CobroMP[]) {
      if (!cobros.has(String(c.id))) cobros.set(String(c.id), c)
    }
  } else {
    console.error("sincronizarSuscripcion: authorized_payments/search falló", preapprovalId, busqueda.status)
  }

  // 1. Registrar cada cobro. Solo quien efectivamente cambia la fila "gana" el evento y manda el
  //    mail, así un aviso repetido o el webhook y la página de bienvenida a la vez no duplican nada.
  const nuevosAprobados: CobroMP[] = []
  const nuevosRechazados: CobroMP[] = []
  for (const cobro of cobros.values()) {
    const estadoPago = cobro.payment?.status
    if (!estadoPago || !cobro.payment?.id) continue // factura programada, todavía sin intento de cobro

    const fila = {
      organization_id: sub.organization_id,
      subscription_id: sub.id,
      mp_authorized_payment_id: String(cobro.id),
      mp_payment_id: String(cobro.payment.id),
      amount: Number(cobro.transaction_amount),
      status: estadoPago,
      status_detail: cobro.payment.status_detail,
      debit_date: cobro.debit_date,
      retry_attempt: cobro.retry_attempt,
    }

    const { data: insertada } = await admin
      .from("platform_payments")
      .upsert(fila, { onConflict: "mp_authorized_payment_id", ignoreDuplicates: true })
      .select("id")
    let cambio = (insertada?.length ?? 0) > 0
    if (!cambio) {
      const { data: actualizada } = await admin
        .from("platform_payments")
        .update({ ...fila, updated_at: new Date().toISOString() })
        .eq("mp_authorized_payment_id", fila.mp_authorized_payment_id)
        .neq("status", estadoPago)
        .select("id")
      cambio = (actualizada?.length ?? 0) > 0
    }
    if (!cambio) continue
    if (estadoPago === "approved") nuevosAprobados.push(cobro)
    else if (estadoPago === "rejected" || estadoPago === "cancelled") nuevosRechazados.push(cobro)
  }

  // 2. Estado resultante, mirando todos los cobros registrados (no solo los de este aviso).
  const { data: pagos } = await admin
    .from("platform_payments")
    .select("status, debit_date, amount, mp_payment_id")
    .eq("subscription_id", sub.id)
    .order("debit_date", { ascending: false })
  const aprobados = (pagos ?? []).filter((p) => p.status === "approved")
  const ultimoAprobado = aprobados[0] ?? null
  // Para el estado solo cuentan los cobros de la suscripción de Mercado Pago actual. Después de una
  // reactivación los del preapproval anterior quedan en el historial, pero un rechazo viejo no
  // marca atrasada la cuenta nueva y un cobro viejo aprobado no la reactiva sin pagar.
  const desde = pre.data?.date_created ? Date.parse(pre.data.date_created) : 0
  const pagosActuales = (pagos ?? []).filter((p) => !p.debit_date || Date.parse(p.debit_date) >= desde)
  const aprobadosActuales = pagosActuales.filter((p) => p.status === "approved")
  const ultimo = pagosActuales[0] ?? null
  const atrasado = !!ultimo && (ultimo.status === "rejected" || ultimo.status === "cancelled")

  const mpStatus: string = pre.data?.status ?? null
  const ahora = new Date().toISOString()
  const cambiosSub: Record<string, unknown> = {
    mp_status: mpStatus,
    next_payment_date: pre.data?.next_payment_date ?? null,
    last_synced_at: ahora,
    updated_at: ahora,
  }
  if (ultimoAprobado) cambiosSub.last_paid_at = ultimoAprobado.debit_date ?? ahora
  await admin.from("platform_subscriptions").update(cambiosSub).eq("id", sub.id)
  const subActual = { ...sub, ...cambiosSub } as Suscripcion

  // Primer cobro aprobado: recién ahí se sube la suscripción al precio completo, así el primer mes
  // siempre se cobra al 50% aunque Mercado Pago lo debite un rato después de autorizar la tarjeta.
  if (aprobados.length > 0 && !sub.first_paid_at) {
    const { data: primero } = await admin
      .from("platform_subscriptions")
      .update({ first_paid_at: aprobados[aprobados.length - 1]?.debit_date ?? ahora })
      .eq("id", sub.id)
      .is("first_paid_at", null)
      .select("id")
    if (primero?.length) await subirAPrecioCompleto(admin, subActual)
  }

  // 3. Transiciones de la organización, cada una con un UPDATE condicional (solo una corrida gana).
  //    La cuenta se activa apenas Mercado Pago autoriza la tarjeta (o aprueba un cobro): el cliente
  //    empieza a usarla en el momento, y si el primer cobro después falla pasa a atrasada.
  const reportados = new Set<string>()
  const pagoValido = (aprobadosActuales.length > 0 || mpStatus === "authorized") && !atrasado && mpStatus !== "cancelled"
  if (pagoValido) {
    const { data: activada } = await admin
      .from("organizations")
      .update({ subscription_status: "active", subscription_started_at: ahora, trial_ends_at: null, updated_at: ahora })
      .eq("id", org.id)
      .eq("subscription_status", "pending")
      .select("id")
    if (activada?.length) {
      const cobro = nuevosAprobados[0] ?? null
      if (cobro) reportados.add(String(cobro.id))
      await mandarBienvenida(subActual, org)
      await avisarDueno(`Nueva venta: BG Tienda para ${org.name}`, detalleVenta(subActual, org, cobro, "Compra nueva"))
    } else if (sub.cancelled_at && mpStatus === "authorized") {
      // Reactivación (reactivar-suscripcion): el dueño se volvió a suscribir después de cancelar o
      // de quedar suspendido. Vuelve a active y deja de tener fecha de corte.
      const { data: reactivada } = await admin
        .from("platform_subscriptions")
        .update({ cancelled_at: null, past_due_since: null })
        .eq("id", sub.id)
        .not("cancelled_at", "is", null)
        .select("id")
      if (reactivada?.length) {
        await admin
          .from("organizations")
          .update({ subscription_status: "active", subscription_ends_at: null, updated_at: ahora })
          .eq("id", org.id)
          .in("subscription_status", ["active", "past_due", "suspended"])
        const cobro = nuevosAprobados[0] ?? null
        if (cobro) reportados.add(String(cobro.id))
        await avisarDueno(`Reactivó la suscripción: ${org.name}`, detalleVenta(subActual, org, cobro, "Suscripción reactivada"))
      }
    } else if (aprobadosActuales.length > 0) {
      const { data: regularizada } = await admin
        .from("organizations")
        .update({ subscription_status: "active", updated_at: ahora })
        .eq("id", org.id)
        .in("subscription_status", ["past_due", "suspended"])
        .select("id")
      if (regularizada?.length) {
        const cobro = nuevosAprobados[0] ?? null
        if (cobro) reportados.add(String(cobro.id))
        await admin.from("platform_subscriptions").update({ past_due_since: null }).eq("id", sub.id)
        await avisarDueno(`Regularizó el pago: ${org.name}`, detalleVenta(subActual, org, cobro, "Volvió a pagar"))
      }
    }
  } else if (atrasado) {
    const { data: marcada } = await admin
      .from("organizations")
      .update({ subscription_status: "past_due", updated_at: ahora })
      .eq("id", org.id)
      .eq("subscription_status", "active")
      .select("id")
    if (marcada?.length) {
      await admin.from("platform_subscriptions").update({ past_due_since: ahora }).eq("id", sub.id)
      await avisarPagoRechazado(subActual, org)
    }
  }

  // Aviso al dueño por cada cobro nuevo que no salió ya en el mail de compra o de regularización.
  for (const cobro of nuevosAprobados) {
    if (reportados.has(String(cobro.id))) continue
    await avisarDueno(`Cobro aprobado: ${org.name}`, detalleVenta(subActual, org, cobro, "Cobro mensual aprobado"))
  }
  for (const cobro of nuevosRechazados) {
    await avisarDueno(`Pago rechazado: ${org.name}`, detalleVenta(subActual, org, cobro, "Cobro rechazado (Mercado Pago lo reintenta)"))
  }

  // 4. Cancelación (la hizo el cliente, o Mercado Pago después de 3 cobros rechazados). Si ya pagó,
  //    sigue usando lo que pagó y el cron la suspende al vencer. Si canceló antes del primer cobro,
  //    se suspende ya: si no, autorizar la tarjeta y cancelar dejaría una tienda gratis.
  if (mpStatus === "cancelled") {
    const { data: cancelada } = await admin
      .from("platform_subscriptions")
      .update({ cancelled_at: ahora })
      .eq("id", sub.id)
      .is("cancelled_at", null)
      .select("id")
    if (cancelada?.length) {
      if (ultimoAprobado) {
        const hasta = new Date(ultimoAprobado.debit_date ?? ahora)
        hasta.setMonth(hasta.getMonth() + 1)
        await admin.from("organizations").update({ subscription_ends_at: hasta.toISOString(), updated_at: ahora }).eq("id", org.id)
        await avisarDueno(
          `Canceló la suscripción: ${org.name}`,
          detalleVenta(subActual, org, null, `Suscripción cancelada. La tienda sigue activa hasta el ${fecha(hasta.toISOString())} y después se suspende sola.`),
        )
      } else {
        await admin
          .from("organizations")
          .update({ subscription_status: "suspended", updated_at: ahora })
          .eq("id", org.id)
          .in("subscription_status", ["active", "past_due"])
        await avisarDueno(
          `Canceló antes del primer cobro: ${org.name}`,
          detalleVenta(subActual, org, null, "Suscripción cancelada antes de cobrar el primer mes. Si la cuenta estaba activa, quedó suspendida."),
        )
      }
    }
  }

  const { data: final } = await admin.from("organizations").select("subscription_status").eq("id", org.id).single()
  return { status: final?.subscription_status ?? null }
}

// Primer mes al 50%: la suscripción se crea por el precio del primer mes y, apenas se confirma
// ese cobro, se sube al precio de lista para los meses siguientes.
async function subirAPrecioCompleto(admin: SupabaseClient, sub: Suscripcion): Promise<void> {
  if (!sub.mp_preapproval_id || Number(sub.current_amount) >= Number(sub.full_amount)) return
  const r = await mpFetch(`/preapproval/${encodeURIComponent(sub.mp_preapproval_id)}`, {
    method: "PUT",
    body: JSON.stringify({ auto_recurring: { transaction_amount: Number(sub.full_amount), currency_id: "ARS" } }),
  })
  if (r.ok) {
    await admin.from("platform_subscriptions").update({ current_amount: sub.full_amount }).eq("id", sub.id)
    return
  }
  console.error("subirAPrecioCompleto: Mercado Pago rechazó el cambio de monto", sub.mp_preapproval_id, r.status, r.data)
  await avisarDueno(
    "Atención: no se pudo subir una suscripción al precio completo",
    `<p>Mercado Pago no aceptó subir la suscripción ${sub.mp_preapproval_id} de ${formatArs(sub.current_amount)} a ` +
      `${formatArs(sub.full_amount)}. Hay que revisarla a mano: si no se corrige, el cliente va a seguir pagando el precio del primer mes.</p>` +
      `<p>Respuesta de Mercado Pago: ${escapeHtml(JSON.stringify(r.data ?? {}).slice(0, 500))}</p>`,
  )
}

// ─── Mails ───────────────────────────────────────────────────────────────────

export async function avisarDueno(asunto: string, html: string): Promise<void> {
  const to = Deno.env.get("OWNER_ALERT_EMAIL") ?? OWNER_EMAIL_DEFAULT
  await sendEmail({ to, subject: asunto, html: `<div style="font-family:sans-serif;">${html}</div>`, fromName: "Binary Goats" })
}

function detalleVenta(sub: Suscripcion, org: Organizacion, cobro: CobroMP | null, titulo: string): string {
  const tienda = `${storeSiteUrl()}/${org.slug}`
  const superadmin = Deno.env.get("SUPERADMIN_URL")
  const filas: [string, string][] = [
    ["Negocio", org.name],
    ["Tienda", `<a href="${tienda}">${tienda}</a>`],
    ["Cliente", sub.contact_name ?? "-"],
    ["Email", sub.contact_email ?? "-"],
    ["WhatsApp", sub.contact_phone ?? "-"],
    ["Email de Mercado Pago", sub.payer_email ?? sub.contact_email ?? "-"],
    ["Plan", `${sub.plan} — ${formatArs(sub.full_amount)}/mes (primer mes ${formatArs(sub.first_amount)})`],
  ]
  if (cobro) {
    filas.push(["Monto cobrado", formatArs(Number(cobro.transaction_amount))])
    filas.push(["Pago en Mercado Pago", String(cobro.payment?.id ?? "-")])
    filas.push(["Estado del pago", `${cobro.payment?.status ?? "-"} (${cobro.payment?.status_detail ?? "-"})`])
    filas.push(["Fecha", fecha(cobro.debit_date)])
  }
  filas.push(["Suscripción en Mercado Pago", sub.mp_preapproval_id ?? "-"])
  if (sub.next_payment_date) filas.push(["Próximo cobro", fecha(sub.next_payment_date)])
  if (superadmin) filas.push(["Superadmin", `<a href="${superadmin}/organizations">${superadmin}/organizations</a>`])

  return (
    `<h2>${escapeHtml(titulo)}</h2>` +
    `<table style="border-collapse:collapse;">` +
    filas
      .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0; color:#6b6b6b;">${k}</td><td style="padding:4px 0;">${k === "Tienda" || k === "Superadmin" ? v : escapeHtml(v)}</td></tr>`)
      .join("") +
    `</table>`
  )
}

async function mandarBienvenida(sub: Suscripcion, org: Organizacion): Promise<void> {
  if (!sub.contact_email) return
  const tienda = `${storeSiteUrl()}/${org.slug}`
  const panel = `${storeSiteUrl()}/admin/login`
  await sendEmail({
    to: sub.contact_email,
    subject: `¡Tu tienda ${org.name} ya está lista!`,
    fromName: "BG Tienda",
    html:
      `<div style="font-family:sans-serif; max-width:520px;">` +
      `<h2>¡Bienvenido a BG Tienda${sub.contact_name ? `, ${escapeHtml(sub.contact_name.split(" ")[0])}` : ""}!</h2>` +
      `<p>Tu suscripción quedó confirmada y tu tienda ya está activa.</p>` +
      `<p><strong>Tu panel:</strong> <a href="${panel}">${panel}</a><br/>Entrás con <strong>${escapeHtml(sub.contact_email)}</strong> y la contraseña que elegiste.</p>` +
      `<p><strong>Tu tienda:</strong> <a href="${tienda}">${tienda}</a></p>` +
      `<p>Primeros pasos: cargá tu logo y colores en Personalización, sumá tus productos con fotos y precios, y compartí el link de tu tienda.</p>` +
      `<p>Tu suscripción se renueva sola cada mes por ${formatArs(sub.full_amount)}. Podés ver los cobros o cancelarla desde Mi suscripción, dentro del panel.</p>` +
      `<p>¿Dudas? Respondé este mail o escribinos por WhatsApp.</p>` +
      `<p style="color:#6b6b6b;">Binary Goats</p>` +
      `</div>`,
  })
}

async function avisarPagoRechazado(sub: Suscripcion, org: Organizacion): Promise<void> {
  if (!sub.contact_email) return
  await sendEmail({
    to: sub.contact_email,
    subject: `No pudimos cobrar tu suscripción de BG Tienda`,
    fromName: "BG Tienda",
    html:
      `<div style="font-family:sans-serif; max-width:520px;">` +
      `<h2>Hubo un problema con el cobro de ${escapeHtml(org.name)}</h2>` +
      `<p>Mercado Pago no pudo cobrar la cuota de este mes. Tu tienda sigue online mientras Mercado Pago reintenta el cobro durante los próximos días.</p>` +
      `<p>Para evitar que se suspenda, revisá que tu tarjeta tenga fondos o cambiala desde tu cuenta de Mercado Pago (Suscripciones).</p>` +
      `<p style="color:#6b6b6b;">Binary Goats</p>` +
      `</div>`,
  })
}

async function avisarSuscripcionHuerfana(preapprovalId: string, pre: any): Promise<void> {
  await avisarDueno(
    "Atención: llegó un aviso de una suscripción sin cuenta",
    `<p>Mercado Pago avisó sobre la suscripción ${escapeHtml(preapprovalId)} (estado ${escapeHtml(String(pre?.status ?? "-"))}, ` +
      `email ${escapeHtml(String(pre?.payer_email ?? "-"))}), pero no hay ninguna cuenta asociada. Puede ser un alta que se borró por no pagar ` +
      `a tiempo y que el cliente pagó después: revisala en Mercado Pago y, si hubo un cobro, devolvelo o creale la cuenta a mano.</p>`,
  )
}

export function formatArs(value: number | string | null): string {
  if (value == null) return "-"
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 }).format(Number(value))
}

function fecha(iso: string | null): string {
  if (!iso) return "-"
  return new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" })
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

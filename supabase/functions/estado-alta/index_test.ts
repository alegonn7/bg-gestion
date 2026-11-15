// Prueba el handler real con respuestas de la base interceptadas. No usa la base ni Mercado Pago.
import assert from "node:assert/strict"

let handler: (req: Request) => Response | Promise<Response>
const serve = Deno.serve
Deno.serve = ((fn: typeof handler) => { handler = fn; return {} }) as unknown as typeof Deno.serve
await import("./index.ts")
Deno.serve = serve

const CUENTA = "00000000-0000-4000-8000-000000000001"
const SUSCRIPCION = "00000000-0000-4000-8000-000000000002"
const PAGO = "00000000-0000-4000-8000-000000000003"

async function consultar(opciones: {
  estado?: string
  producto?: string
  pago?: { id: string; amount: number | string; status: string } | null
  desactualizada?: boolean
}) {
  const fetchAnterior = globalThis.fetch
  Deno.env.set("SUPABASE_URL", "https://prueba.supabase.invalid")
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "prueba-local-sin-permisos")
  const consultas: URL[] = []
  const sub = {
    id: SUSCRIPCION,
    organization_id: CUENTA,
    product: opciones.producto ?? "gestion",
    plan: "profesional",
    contact_email: "prueba@example.invalid",
    first_paid_at: null,
    mp_preapproval_id: null,
    mp_plan_id: null,
    last_synced_at: new Date(Date.now() - (opciones.desactualizada ? 60000 : 0)).toISOString(),
    organizations: { slug: "prueba", name: "Prueba", subscription_status: opciones.estado ?? "active" },
  }
  globalThis.fetch = ((input: Request | URL | string) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    consultas.push(url)
    assert.equal(url.hostname, "prueba.supabase.invalid", "no se permiten llamadas externas")
    let filas: unknown[]
    if (url.pathname.endsWith("/platform_subscriptions")) {
      filas = [sub]
    } else if (url.pathname.endsWith("/platform_payments")) {
      assert.equal(url.searchParams.get("subscription_id"), `eq.${SUSCRIPCION}`)
      assert.equal(url.searchParams.get("status"), "eq.approved")
      assert.equal(url.searchParams.get("limit"), "1")
      assert.equal(url.searchParams.get("order"), "debit_date.asc.nullslast,created_at.asc,id.asc")
      filas = opciones.pago?.status === "approved" ? [opciones.pago] : []
    } else throw new Error(`Consulta inesperada: ${url.pathname}`)
    return Promise.resolve(new Response(JSON.stringify(filas), { headers: { "Content-Type": "application/json" } }))
  }) as typeof fetch
  try {
    const res = await handler(new Request("https://funcion.invalid/estado-alta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cuenta: CUENTA }),
    }))
    assert.equal(res.status, 200)
    return { data: await res.json(), consultas }
  } finally {
    globalThis.fetch = fetchAnterior
    Deno.env.delete("SUPABASE_URL")
    Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY")
  }
}

Deno.test("autorizar la cuenta sin un cobro aprobado no informa una compra", async () => {
  const { data } = await consultar({})
  assert.equal(data.estado, "active")
  assert.equal(data.compra, null)
})

Deno.test("una cuenta en mora con un pago rechazado no informa una compra", async () => {
  const { data } = await consultar({ estado: "past_due", pago: { id: PAGO, amount: 20000, status: "rejected" } })
  assert.equal(data.compra, null)
})

Deno.test("solo el primer cobro aprobado de la suscripción informa ID opaco, valor real y ARS", async () => {
  const { data } = await consultar({ pago: { id: PAGO, amount: "35000.50", status: "approved" } })
  assert.deepEqual(data.compra, { transaction_id: PAGO, value: 35000.5, currency: "ARS" })
})

Deno.test("una cuenta activa aún sin primer cobro vuelve a consultar su suscripción", async () => {
  const { data, consultas } = await consultar({ desactualizada: true })
  assert.equal(data.estado, "active")
  assert.equal(data.compra, null)
  assert.equal(consultas.filter((u) => u.pathname.endsWith("/platform_subscriptions")).length, 2)
})

Deno.test("no informa una compra de valor inválido", async () => {
  for (const amount of [0, -1, "no-es-un-importe"]) {
    const { data } = await consultar({ pago: { id: PAGO, amount, status: "approved" } })
    assert.equal(data.compra, null)
  }
})

Deno.test("BG Tienda conserva su respuesta y no consulta cobros para esta medición", async () => {
  const { data, consultas } = await consultar({ producto: "tienda" })
  assert.equal("compra" in data, false)
  assert.equal(consultas.some((u) => u.pathname.endsWith("/platform_payments")), false)
})

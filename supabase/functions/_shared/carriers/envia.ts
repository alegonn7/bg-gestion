// Envia.com: intermediario con registro gratuito y autoservicio (accounts.envia.com/signup) que
// cotiza varios correos argentinos (Andreani, Correo Argentino, OCA, Urbano...) con una sola
// clave de API. Es la salida para tiendas sin contrato propio con Andreani/Correo Argentino.
//
// Fuente: documentación oficial (docs.envia.com/reference/shipping-rates):
//   - POST /ship/rate/ con Bearer <apiKey>; sandbox api-test.envia.com, producción api.envia.com.
//   - shipment.carrier es un solo correo por llamada, así que se cotiza uno por uno en paralelo
//     y se cobra el más barato.
//   - Los correos disponibles salen de queries(.test).envia.com/available-carrier/AR/0/1.
// Sin verificar contra el sandbox todavía: el formato de `state` para Argentina (se manda el
// código ISO 3166-2:AR sin "AR-") y si piden calle/teléfono reales para cotizar (se mandan
// valores de relleno: en el preview del checkout todavía no hay dirección completa).

import type { CarrierCredentials, QuoteInput, QuoteResult } from "./types.ts"

const FALLBACK_CARRIERS = ["andreani", "correoArgentino", "oca"]

const PROVINCE_CODES: Record<string, string> = {
  "buenos aires": "B",
  "ciudad autonoma de buenos aires": "C",
  "catamarca": "K",
  "chaco": "H",
  "chubut": "U",
  "cordoba": "X",
  "corrientes": "W",
  "entre rios": "E",
  "formosa": "P",
  "jujuy": "Y",
  "la pampa": "L",
  "la rioja": "F",
  "mendoza": "M",
  "misiones": "N",
  "neuquen": "Q",
  "rio negro": "R",
  "salta": "A",
  "san juan": "J",
  "san luis": "D",
  "santa cruz": "Z",
  "santa fe": "S",
  "santiago del estero": "G",
  "tierra del fuego": "V",
  "tucuman": "T",
}

function provinceCode(province: string | null | undefined): string {
  const key = (province ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
  return PROVINCE_CODES[key] ?? "B"
}

function hosts(environment: string) {
  return environment === "test"
    ? { api: "https://api-test.envia.com", queries: "https://queries.test.envia.com" }
    : { api: "https://api.envia.com", queries: "https://queries.envia.com" }
}

export async function listCarriers(credentials: CarrierCredentials, environment: string): Promise<string[]> {
  const response = await fetch(`${hosts(environment).queries}/available-carrier/AR/0/1`, {
    headers: { Authorization: `Bearer ${credentials.apiKey}` },
  })
  if (response.status === 401 || response.status === 403) {
    throw new Error("Envia rechazó la clave de API")
  }
  const data = await response.json().catch(() => null)
  const names = Array.isArray(data?.data) ? data.data.map((c: { name?: string }) => c.name).filter(Boolean) : []
  return names.length ? names : FALLBACK_CARRIERS
}

type EnviaRate = {
  carrier?: string
  service?: string
  totalPrice?: number | string
  currency?: string
  deliveryDate?: { dateDifference?: number }
}

export async function quote(
  credentials: CarrierCredentials,
  environment: string,
  input: QuoteInput,
): Promise<QuoteResult> {
  // La tienda puede limitar a qué correos ofrecer (ej. "andreani"); si no, todos los de AR.
  const wanted = (credentials.carriers ?? "").split(",").map((c) => c.trim()).filter(Boolean)
  const carriers = wanted.length ? wanted : await listCarriers(credentials, environment)

  const address = (postalCode: string, province: string | null | undefined) => ({
    name: "BG Tienda",
    phone: "1100000000",
    street: "-",
    number: "0",
    city: province || "-",
    state: provinceCode(province),
    country: "AR",
    postalCode,
  })

  const body = (carrier: string) => ({
    origin: address(input.originPostalCode, input.originProvince),
    destination: address(input.destinationPostalCode, input.destinationProvince),
    packages: [{
      type: "box",
      content: "Mercadería",
      amount: 1,
      declaredValue: Math.round(input.declaredValue),
      weight: Math.max(input.weightGrams / 1000, 0.01),
      weightUnit: "KG",
      lengthUnit: "CM",
      dimensions: { length: input.lengthCm, width: input.widthCm, height: input.heightCm },
    }],
    settings: { currency: "ARS" },
    shipment: { type: 1, carrier },
  })

  const results = await Promise.all(carriers.map(async (carrier) => {
    const response = await fetch(`${hosts(environment).api}/ship/rate/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${credentials.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body(carrier)),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok || !Array.isArray(data?.data)) return { rates: [] as EnviaRate[], error: data }
    return { rates: data.data as EnviaRate[], error: null }
  }))

  const rates = results.flatMap((r) => r.rates)
    .map((r) => ({ ...r, price: Number(r.totalPrice) }))
    .filter((r) => Number.isFinite(r.price) && r.price > 0 && (!r.currency || r.currency === "ARS"))

  if (!rates.length) {
    throw new Error(`Envia no devolvió tarifas: ${JSON.stringify(results.map((r) => r.error))}`)
  }

  const cheapest = rates.reduce((a, b) => (b.price < a.price ? b : a))
  return {
    cost: cheapest.price,
    estimatedDays: cheapest.deliveryDate?.dateDifference ?? null,
    quoteReference: [cheapest.carrier, cheapest.service].filter(Boolean).join(":") || null,
  }
}

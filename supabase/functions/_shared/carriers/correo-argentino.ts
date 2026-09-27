// Correo Argentino / MiCorreo (PAQ.AR).
//
// Fuente: documentación comunitaria (github.com/YamilEzequiel/correo-argentino) -- no es la
// documentación oficial de Correo Argentino, así que hay que confirmar esto contra el sandbox
// real apenas existan credenciales de TEST (portal de alta: integracion.correoargentino.com.ar).
//
// Auth en 2 pasos: Basic Auth (userToken:passwordToken en base64) contra /token devuelve un
// JWT de corta duración; ese JWT se usa como Bearer en /rates. No se cachea el JWT entre
// llamadas -- se pide uno nuevo por cotización, es una llamada extra pero evita tener que
// manejar su expiración.

import type { CarrierCredentials, QuoteInput, QuoteResult } from "./types.ts"

function baseUrl(environment: string): string {
  return environment === "test"
    ? "https://apitest.correoargentino.com.ar/micorreo/v1"
    : "https://api.correoargentino.com.ar/micorreo/v1"
}

async function getToken(credentials: CarrierCredentials, environment: string): Promise<string> {
  const basic = btoa(`${credentials.userToken}:${credentials.passwordToken}`)
  const response = await fetch(`${baseUrl(environment)}/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.token) {
    throw new Error(`No se pudo autenticar con Correo Argentino: ${JSON.stringify(data)}`)
  }
  return data.token
}

function parseIntSafe(value: unknown): number | null {
  const n = parseInt(String(value), 10)
  return Number.isFinite(n) ? n : null
}

export async function quote(
  credentials: CarrierCredentials,
  environment: string,
  input: QuoteInput,
): Promise<QuoteResult> {
  const token = await getToken(credentials, environment)

  const response = await fetch(`${baseUrl(environment)}/rates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      customerId: credentials.customerId,
      postalCodeOrigin: input.originPostalCode,
      postalCodeDestination: input.destinationPostalCode,
      dimensions: [
        {
          weight: input.weightGrams,
          length: input.lengthCm,
          width: input.widthCm,
          height: input.heightCm,
          quantity: 1,
        },
      ],
    }),
  })

  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.rates?.length) {
    throw new Error(`Correo Argentino no devolvió tarifas: ${JSON.stringify(data)}`)
  }

  // v1 no ofrece elegir entre las variantes que devuelve (a domicilio/a sucursal, standard/
  // expreso) -- toma la más barata. Elegir variante queda para una fase futura.
  const cheapest = data.rates.reduce((min: any, r: any) => (r.price < min.price ? r : min), data.rates[0])

  return {
    cost: cheapest.price,
    estimatedDays: parseIntSafe(cheapest.deliveryTimeMax),
    quoteReference: null,
  }
}

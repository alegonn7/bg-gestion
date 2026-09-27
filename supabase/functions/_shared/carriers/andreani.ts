// Andreani.
//
// Fuente: documentación comunitaria (alejoasotelo.github.io/andreani-api-docs) -- no es la
// documentación oficial de Andreani. IMPORTANTE: esa fuente confirma que /v1/tarifas toma
// `cpDestino` + `contrato`, pero NO detalla parámetros de origen/peso/dimensiones -- se mandan
// igual como query params adicionales por si la API real los acepta (nombres en español, como
// el resto de la API), pero esto es lo más incierto de todo el módulo de envíos. Confirmar
// contra el sandbox real apenas haya credenciales de Andreani PyME (pymes.andreani.com/
// integraciones) antes de dar esto por definitivo.

import type { CarrierCredentials, QuoteInput, QuoteResult } from "./types.ts"

const BASE_URL = "https://apis.andreani.com"

async function getToken(credentials: CarrierCredentials): Promise<string> {
  const basic = btoa(`${credentials.username}:${credentials.password}`)
  const response = await fetch(`${BASE_URL}/v1/login`, {
    method: "GET",
    headers: { Authorization: `Basic ${basic}` },
  })
  const data = await response.json().catch(() => null)
  const token = typeof data === "string" ? data : data?.token
  if (!response.ok || !token) {
    throw new Error(`No se pudo autenticar con Andreani: ${JSON.stringify(data)}`)
  }
  return token
}

export async function quote(
  credentials: CarrierCredentials,
  _environment: string,
  input: QuoteInput,
): Promise<QuoteResult> {
  const token = await getToken(credentials)

  const params = new URLSearchParams({
    cpDestino: input.destinationPostalCode,
    cpOrigen: input.originPostalCode,
    contrato: credentials.contrato,
    peso: String(input.weightGrams),
    alto: String(input.heightCm),
    ancho: String(input.widthCm),
    largo: String(input.lengthCm),
  })

  const response = await fetch(`${BASE_URL}/v1/tarifas?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  const data = await response.json().catch(() => null)
  if (!response.ok || data?.tarifaConIva == null) {
    throw new Error(`Andreani no devolvió una tarifa: ${JSON.stringify(data)}`)
  }

  return {
    cost: data.tarifaConIva,
    estimatedDays: data.plazoEntrega?.maximo ?? null,
    quoteReference: null,
  }
}

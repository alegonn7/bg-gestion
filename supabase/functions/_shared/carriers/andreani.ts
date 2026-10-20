// Andreani.
//
// Fuente: documentación oficial (developers.andreani.com/documentacion), que confirma:
//   - Hosts: https://apis.andreani.com (producción) y https://apisqa.andreani.com (QA/prueba).
//   - Login: Basic Auth (usuario:contraseña) y el token vuelve en el HEADER de respuesta
//     `x-authorization-token`; ese mismo header se manda en las llamadas siguientes.
//   - tarifas responde { pesoAforado, tarifaSinIva: {..., total}, tarifaConIva: {..., total} }
//     con los montos como string.
// La doc oficial NO lista los parámetros de entrada de tarifas: los de abajo (cpDestino,
// contrato, cliente, sucursalOrigen, bultos[0][...]) son los que usan las integraciones
// comunitarias. Confirmar contra QA apenas haya credenciales.
//
// Las credenciales (usuario, contraseña, contrato y número de cliente) no salen del panel
// "Integraciones" de andreani.com (ese panel solo ofrece WooCommerce/Tiendanube): las da el
// ejecutivo comercial de Andreani al habilitar el acceso a la API.

import type { CarrierCredentials, QuoteInput, QuoteResult } from "./types.ts"

function baseUrl(environment: string): string {
  return environment === "test" ? "https://apisqa.andreani.com" : "https://apis.andreani.com"
}

export async function getToken(credentials: CarrierCredentials, environment: string): Promise<string> {
  const basic = btoa(`${credentials.username}:${credentials.password}`)
  const response = await fetch(`${baseUrl(environment)}/login`, {
    method: "GET",
    headers: { Authorization: `Basic ${basic}` },
  })
  const data = await response.json().catch(() => null)
  // El token oficial viene en el header; el body se mira solo como respaldo.
  const token = response.headers.get("x-authorization-token") ?? (typeof data === "string" ? data : data?.token)
  if (!response.ok || !token) {
    throw new Error(`No se pudo autenticar con Andreani: ${JSON.stringify(data)}`)
  }
  return token
}

export async function quote(
  credentials: CarrierCredentials,
  environment: string,
  input: QuoteInput,
): Promise<QuoteResult> {
  const token = await getToken(credentials, environment)

  const params = new URLSearchParams({
    cpDestino: input.destinationPostalCode,
    contrato: credentials.contrato,
    "bultos[0][kilos]": String(input.weightGrams / 1000),
    "bultos[0][volumen]": String(input.lengthCm * input.widthCm * input.heightCm),
    "bultos[0][largoCm]": String(input.lengthCm),
    "bultos[0][anchoCm]": String(input.widthCm),
    "bultos[0][altoCm]": String(input.heightCm),
    "bultos[0][valorDeclarado]": String(Math.round(input.declaredValue)),
  })
  if (credentials.cliente) params.set("cliente", credentials.cliente)
  if (credentials.sucursalOrigen) params.set("sucursalOrigen", credentials.sucursalOrigen)
  // cpOrigen no figura en ninguna fuente, pero no molesta y sirve si la API lo toma.
  params.set("cpOrigen", input.originPostalCode)

  const response = await fetch(`${baseUrl(environment)}/v1/tarifas?${params}`, {
    headers: { "x-authorization-token": token },
  })

  const data = await response.json().catch(() => null)
  const total = Number(data?.tarifaConIva?.total)
  if (!response.ok || !Number.isFinite(total)) {
    throw new Error(`Andreani no devolvió una tarifa: ${JSON.stringify(data)}`)
  }

  return {
    cost: total,
    estimatedDays: data.plazoEntrega?.maximo ?? null,
    quoteReference: null,
  }
}

// Cliente de la API de Afip SDK (https://afipsdk.com). Afip SDK habla con ARCA por nosotros:
// autenticación (WSAA), tokens, SOAP y automatizaciones de la página de ARCA.
// Módulo puro (sin Deno.env): el access token y el ambiente se reciben por parámetro.

const API_URL = "https://app.afipsdk.com/api/v1"

export type Ambiente = "dev" | "prod"

export interface AfipSdk {
  accessToken: string
  ambiente: Ambiente
}

export class AfipSdkError extends Error {
  constructor(message: string, readonly status: number, readonly body: unknown) {
    super(message)
  }
}

async function llamar<T>(sdk: AfipSdk, path: string, method: "GET" | "POST", body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${sdk.accessToken}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let data: any
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { message: text }
  }
  if (!res.ok) {
    const detalle = data?.data_errors ? ` (${JSON.stringify(data.data_errors)})` : ""
    throw new AfipSdkError(`${data?.message || `Afip SDK respondió ${res.status}`}${detalle}`, res.status, data)
  }
  return data as T
}

// ─── Web services de ARCA ────────────────────────────────────────────────────

export interface TicketAcceso {
  token: string
  sign: string
  expiration: string
}

// Afip SDK guarda y reutiliza el ticket mientras sea válido. cert/key son los del CUIT que
// factura; en "dev" se pueden omitir para usar el CUIT de prueba de Afip SDK.
export function obtenerTicketAcceso(
  sdk: AfipSdk,
  opts: { cuit: string; wsid: string; cert?: string; key?: string; forzar?: boolean },
): Promise<TicketAcceso> {
  return llamar(sdk, "afip/auth", "POST", {
    environment: sdk.ambiente,
    tax_id: opts.cuit,
    wsid: opts.wsid,
    cert: opts.cert,
    key: opts.key,
    force_create: opts.forzar ?? false,
  })
}

export interface WebService {
  wsid: string
  soapV12: boolean
  prod: { url: string; wsdl: string }
  dev: { url: string; wsdl: string }
}

export function llamarWebService<T>(sdk: AfipSdk, ws: WebService, metodo: string, params: unknown): Promise<T> {
  const destino = ws[sdk.ambiente]
  return llamar(sdk, "afip/requests", "POST", {
    environment: sdk.ambiente,
    wsid: ws.wsid,
    method: metodo,
    url: destino.url,
    wsdl: destino.wsdl,
    soap_v_1_2: ws.soapV12,
    params,
  })
}

// ─── Automatizaciones (trámites de la página de ARCA con la clave fiscal) ────

export interface Automatizacion {
  id: string
  status: "in_process" | "complete" | "error" | string
  data?: any
}

// Arranca la automatización y vuelve enseguida; el resultado se consulta con consultarAutomatizacion.
export function iniciarAutomatizacion(sdk: AfipSdk, nombre: string, params: Record<string, unknown>): Promise<Automatizacion> {
  return llamar(sdk, "automations", "POST", { automation: nombre, params })
}

export function consultarAutomatizacion(sdk: AfipSdk, id: string): Promise<Automatizacion> {
  return llamar(sdk, `automations/${id}`, "GET")
}

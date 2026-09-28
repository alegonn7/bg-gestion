// Facturación electrónica de ARCA (web service WSFEv1) a través de Afip SDK:
// facturas, notas de crédito y notas de débito A, B y C.

import { type AfipSdk, llamarWebService, type WebService } from "./afipsdk.ts"

export const WSFE: WebService = {
  wsid: "wsfe",
  soapV12: true,
  prod: { url: "https://servicios1.afip.gov.ar/wsfev1/service.asmx", wsdl: "wsfe-production.wsdl" },
  dev: { url: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx", wsdl: "wsfe.wsdl" },
}

// ─── Tipos ──────────────────────────────────────────────────────────────────

// 1/2/3 = Factura/ND/NC A · 6/7/8 = Factura/ND/NC B · 11/12/13 = Factura/ND/NC C
export type TipoComprobante = 1 | 2 | 3 | 6 | 7 | 8 | 11 | 12 | 13

export interface InvoiceItem {
  codigo: string
  descripcion: string
  cantidad: number
  precioUnitario: number      // SIN IVA en comprobantes A; CON IVA en B y C
  importeBonificacion?: number
  codigoAlicuotaIVA: number   // 3=0%, 4=10.5%, 5=21%, 6=27%, 8=5%, 9=2.5%
  importeIVA: number          // IVA por unidad; solo se usa en comprobantes A
}

export interface ComprobanteAsociado {
  tipoComprobante: number
  puntoVenta: number
  numero: number
  fechaEmision: string        // YYYY-MM-DD
}

export interface InvoiceRequest {
  tipoComprobante: TipoComprobante
  puntoVenta: number
  cuitReceptor?: string
  razonSocialReceptor?: string
  condicionIVAReceptor: number // 1=RI, 4=Exento, 5=Consumidor Final, 6=Monotributo
  items: InvoiceItem[]
  comprobantesAsociados?: ComprobanteAsociado[]
}

export interface Importes {
  neto: number
  iva: number
  total: number
  alicuotas: { Id: number; BaseImp: number; Importe: number }[]
}

export interface Emision {
  cae: string
  caeVence: string            // YYYY-MM-DD
  numero: number
  fecha: string               // YYYY-MM-DD
  resultado: string           // "A" aprobado, "O" aprobado con observaciones
  observaciones: string[]
  importes: Importes
  solicitud: unknown          // lo enviado a ARCA, sin el ticket de acceso
  respuesta: unknown
}

export class RechazoArca extends Error {
  constructor(readonly errores: { codigo: number; mensaje: string }[]) {
    super(`ARCA rechazó el comprobante: ${errores.map((e) => `(${e.codigo}) ${e.mensaje}`).join(" · ") || "sin detalle"}`)
  }
  tieneCodigo(codigo: number) {
    return this.errores.some((e) => e.codigo === codigo)
  }
}

// Ticket de acceso de Afip SDK + CUIT que factura
export interface AuthWsfe {
  Token: string
  Sign: string
  Cuit: string
}

// ─── Importes ───────────────────────────────────────────────────────────────

const ALICUOTAS: Record<number, number> = { 3: 0, 4: 0.105, 5: 0.21, 6: 0.27, 8: 0.05, 9: 0.025 }

export function claseComprobante(tipo: number): "A" | "B" | "C" {
  if (tipo <= 3) return "A"
  if (tipo <= 8) return "B"
  return "C"
}

const redondear = (n: number) => Math.round(n * 100) / 100

// A y B informan el IVA separado por alícuota (en la B va incluido en el precio y se separa acá).
// La C no discrimina IVA. El total sale de sumar lo redondeado, como lo valida ARCA.
export function calcularImportes(tipo: TipoComprobante, items: InvoiceItem[]): Importes {
  const clase = claseComprobante(tipo)
  if (clase === "C") {
    const neto = redondear(items.reduce((s, i) => s + i.precioUnitario * i.cantidad - (i.importeBonificacion || 0), 0))
    return { neto, iva: 0, total: neto, alicuotas: [] }
  }

  const porAlicuota = new Map<number, { base: number; iva: number }>()
  for (const item of items) {
    const tasa = ALICUOTAS[item.codigoAlicuotaIVA]
    if (tasa === undefined) throw new Error(`Alícuota de IVA desconocida: ${item.codigoAlicuotaIVA}`)
    const linea = item.precioUnitario * item.cantidad - (item.importeBonificacion || 0)
    const base = clase === "A" ? linea : linea / (1 + tasa)
    const iva = clase === "A" ? item.importeIVA * item.cantidad : linea - base
    const acumulado = porAlicuota.get(item.codigoAlicuotaIVA) ?? { base: 0, iva: 0 }
    porAlicuota.set(item.codigoAlicuotaIVA, { base: acumulado.base + base, iva: acumulado.iva + iva })
  }

  const alicuotas = [...porAlicuota].map(([Id, v]) => ({ Id, BaseImp: redondear(v.base), Importe: redondear(v.iva) }))
  const neto = redondear(alicuotas.reduce((s, a) => s + a.BaseImp, 0))
  const iva = redondear(alicuotas.reduce((s, a) => s + a.Importe, 0))
  return { neto, iva, total: redondear(neto + iva), alicuotas }
}

// ─── Llamadas a ARCA ────────────────────────────────────────────────────────

const lista = <T>(x: T | T[] | undefined | null): T[] => (x == null ? [] : Array.isArray(x) ? x : [x])
const aFechaIso = (yyyymmdd: string) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
const aFechaArca = (iso: string) => iso.replace(/-/g, "")

function erroresDe(resultado: any) {
  return lista<any>(resultado?.Errors?.Err).map((e) => ({ codigo: Number(e.Code), mensaje: String(e.Msg) }))
}

// Fecha de hoy en Argentina (YYYY-MM-DD). Con la fecha UTC, lo facturado después de las 21 hs
// saldría con fecha de mañana.
export function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date())
}

export async function ultimoAutorizado(sdk: AfipSdk, auth: AuthWsfe, puntoVenta: number, tipo: number): Promise<number> {
  const res: any = await llamarWebService(sdk, WSFE, "FECompUltimoAutorizado", { Auth: auth, PtoVta: puntoVenta, CbteTipo: tipo })
  const resultado = res?.FECompUltimoAutorizadoResult
  const errores = erroresDe(resultado)
  if (errores.length) throw new RechazoArca(errores)
  return Number(resultado?.CbteNro ?? 0)
}

async function fechaDeComprobante(sdk: AfipSdk, auth: AuthWsfe, puntoVenta: number, tipo: number, numero: number) {
  const res: any = await llamarWebService(sdk, WSFE, "FECompConsultar", {
    Auth: auth,
    FeCompConsReq: { CbteTipo: tipo, CbteNro: numero, PtoVta: puntoVenta },
  })
  const fch = res?.FECompConsultarResult?.ResultGet?.CbteFch
  return fch ? aFechaIso(String(fch)) : null
}

function armarSolicitud(request: InvoiceRequest, cuitEmisor: string, numero: number, fecha: string, importes: Importes) {
  const cuitReceptor = request.cuitReceptor?.replace(/\D/g, "")
  const detalle: Record<string, unknown> = {
    Concepto: 1,                                  // productos
    DocTipo: cuitReceptor ? 80 : 99,              // 80 = CUIT, 99 = consumidor final sin identificar
    DocNro: cuitReceptor ? Number(cuitReceptor) : 0,
    CbteDesde: numero,
    CbteHasta: numero,
    CbteFch: aFechaArca(fecha),
    ImpTotal: importes.total,
    ImpTotConc: 0,
    ImpNeto: importes.neto,
    ImpOpEx: 0,
    ImpIVA: importes.iva,
    ImpTrib: 0,
    MonId: "PES",
    MonCotiz: 1,
    CondicionIVAReceptorId: request.condicionIVAReceptor, // obligatorio desde la RG 5616
  }
  if (importes.alicuotas.length) detalle.Iva = { AlicIva: importes.alicuotas }
  if (request.comprobantesAsociados?.length) {
    // Notas de crédito/débito: el comprobante asociado es propio, así que su emisor es el mismo CUIT
    detalle.CbtesAsoc = {
      CbteAsoc: request.comprobantesAsociados.map((c) => ({
        Tipo: c.tipoComprobante,
        PtoVta: c.puntoVenta,
        Nro: c.numero,
        Cuit: cuitEmisor,
        CbteFch: aFechaArca(c.fechaEmision),
      })),
    }
  }
  return {
    FeCabReq: { CantReg: 1, PtoVta: request.puntoVenta, CbteTipo: request.tipoComprobante },
    FeDetReq: { FECAEDetRequest: detalle },
  }
}

async function solicitarCAE(sdk: AfipSdk, auth: AuthWsfe, request: InvoiceRequest, numero: number, fecha: string, importes: Importes): Promise<Emision> {
  const solicitud = armarSolicitud(request, auth.Cuit, numero, fecha, importes)
  const respuesta: any = await llamarWebService(sdk, WSFE, "FECAESolicitar", { Auth: auth, FeCAEReq: solicitud })

  const resultado = respuesta?.FECAESolicitarResult
  const detalle = lista<any>(resultado?.FeDetResp?.FECAEDetResponse)[0]
  const observaciones = lista<any>(detalle?.Observaciones?.Obs).map((o) => ({ codigo: Number(o.Code), mensaje: String(o.Msg) }))
  const estado = detalle?.Resultado ?? resultado?.FeCabResp?.Resultado ?? "R"

  if (estado === "R" || !detalle?.CAE) {
    throw new RechazoArca([...erroresDe(resultado), ...observaciones])
  }
  return {
    cae: String(detalle.CAE),
    caeVence: aFechaIso(String(detalle.CAEFchVto)),
    numero,
    fecha,
    resultado: estado,
    observaciones: observaciones.map((o) => `(${o.codigo}) ${o.mensaje}`),
    importes,
    solicitud,
    respuesta,
  }
}

// Pide el CAE para el siguiente número del punto de venta. Si ARCA rechaza la fecha porque el
// último comprobante tiene una posterior (error 10016), reintenta con la fecha de ese comprobante.
export async function emitirComprobante(sdk: AfipSdk, auth: AuthWsfe, request: InvoiceRequest): Promise<Emision> {
  const importes = calcularImportes(request.tipoComprobante, request.items)
  const ultimo = await ultimoAutorizado(sdk, auth, request.puntoVenta, request.tipoComprobante)
  const fecha = hoyArgentina()

  try {
    return await solicitarCAE(sdk, auth, request, ultimo + 1, fecha, importes)
  } catch (err) {
    if (!(err instanceof RechazoArca) || !err.tieneCodigo(10016) || ultimo === 0) throw err
    const fechaUltimo = await fechaDeComprobante(sdk, auth, request.puntoVenta, request.tipoComprobante, ultimo)
    if (!fechaUltimo || fechaUltimo <= fecha) throw err
    return await solicitarCAE(sdk, auth, request, ultimo + 1, fechaUltimo, importes)
  }
}

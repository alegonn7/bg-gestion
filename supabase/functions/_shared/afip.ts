// Utilidades compartidas para ARCA (ex AFIP)
// Usado por fiscal-setup y fiscal-emit

import forge from "npm:node-forge@1.3.1"

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface WSAACredentials {
  token: string
  sign: string
  expires: Date
}

export interface InvoiceItem {
  codigoMtx?: string
  codigo: string
  descripcion: string
  cantidad: number
  precioUnitario: number      // SIN IVA para Fact A, CON IVA para Fact B/C
  importeBonificacion?: number
  codigoAlicuotaIVA: number   // 3=0%, 4=10.5%, 5=21%, 6=27%
  importeIVA: number
}

export interface ComprobanteAsociado {
  tipoComprobante: number
  puntoVenta: number
  numero: number
  cuit?: string
  fechaEmision: string
}

export interface InvoiceRequest {
  tipoComprobante: 1 | 3 | 6 | 8 | 11 | 13
  puntoVenta: number
  fechaEmision: string
  cuitReceptor?: string
  razonSocialReceptor?: string
  condicionIVAReceptor: number
  items: InvoiceItem[]
  actividadAfip: number
  comprobantesAsociados?: ComprobanteAsociado[]
}

export interface InvoiceResult {
  cae: string
  caeVence: string
  numero: number
  resultado: string
  observaciones?: string[]
}

// ─── P12 → PEM ──────────────────────────────────────────────────────────────

export function extractPemFromP12(p12Base64: string, passphrase: string): {
  certPem: string
  keyPem: string
  expiresAt: Date
} {
  const der = forge.util.decode64(p12Base64)
  const asn1 = forge.asn1.fromDer(der)
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, passphrase)

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })

  const keyBag = (keyBags as any)[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]
  const certBag = (certBags as any)[forge.pki.oids.certBag]?.[0]

  if (!keyBag || !certBag) throw new Error("No se pudo extraer cert/key del P12")

  const cert = certBag.cert
  const certPem = forge.pki.certificateToPem(cert)
  const keyPem = forge.pki.privateKeyToPem(keyBag.key)
  const expiresAt = cert.validity.notAfter as Date

  return { certPem, keyPem, expiresAt }
}

// ─── Firmar TRA (PKCS#7) ────────────────────────────────────────────────────

export function signTRA(certPem: string, keyPem: string): string {
  const now = new Date()
  const genTime = new Date(now.getTime() - 10 * 60 * 1000)
  const expTime = new Date(now.getTime() + 10 * 60 * 1000)

  // Convertir a hora Argentina (UTC-3)
  const toArgStr = (d: Date) => {
    const arg = new Date(d.getTime() - 3 * 60 * 60 * 1000)
    return arg.toISOString().slice(0, 19) + '-03:00'
  }

  const traXml = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${Math.floor(now.getTime() / 1000)}</uniqueId>
    <generationTime>${toArgStr(genTime)}</generationTime>
    <expirationTime>${toArgStr(expTime)}</expirationTime>
  </header>
  <service>wsmtxca</service>
</loginTicketRequest>`

  const cert = forge.pki.certificateFromPem(certPem)
  const key = forge.pki.privateKeyFromPem(keyPem)

  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(traXml, "utf8")
  p7.addCertificate(cert)
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: now },
    ],
  })
  p7.sign()

  const der = forge.asn1.toDer(p7.toAsn1()).getBytes()
  return forge.util.encode64(der)
}

// ─── WSAA — obtener token ────────────────────────────────────────────────────

export async function getWSAAToken(
  certPem: string,
  keyPem: string
): Promise<WSAACredentials> {
  const cms = signTRA(certPem, keyPem)

  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <request>${cms}</request>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`

  const res = await fetch("https://wsaa.afip.gov.ar/ws/services/LoginCms", {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": '""' },
    body: soap,
  })

  const xml = await res.text()
  if (!res.ok) {
    const faultMatch = xml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/)
    const detail = faultMatch?.[1]?.trim() || xml.slice(0, 500)
    throw new Error(`WSAA HTTP ${res.status}: ${detail}`)
  }
  return parseWSAAResponse(xml)
}

function parseWSAAResponse(soapXml: string): WSAACredentials {
  const match = soapXml.match(/<loginCmsReturn[^>]*>([\s\S]*?)<\/loginCmsReturn>/)
  if (!match) throw new Error("Respuesta WSAA inválida")

  const inner = match[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')

  const token = extractTag(inner, "token")
  const sign = extractTag(inner, "sign")
  const expStr = extractTag(inner, "expirationTime")

  if (!token || !sign) throw new Error("No se pudo extraer token/sign del WSAA")

  return { token, sign, expires: new Date(expStr) }
}

// ─── WSMTXCA — emitir comprobante ───────────────────────────────────────────

const WSMTXCA_URL = "https://serviciosjava.afip.gob.ar/wsmtxca/services/MTXCAService"

export async function autorizarComprobante(
  credentials: WSAACredentials,
  cuit: string,
  request: InvoiceRequest,
  ultimoNumero: number
): Promise<InvoiceResult> {
  const numero = ultimoNumero + 1
  const totales = calcularTotales(request.items, request.tipoComprobante)

  const esFactB = request.tipoComprobante === 6 || request.tipoComprobante === 8
    || request.tipoComprobante === 11 || request.tipoComprobante === 13
  const esFactA = request.tipoComprobante === 1 || request.tipoComprobante === 3

  const itemsXml = request.items.map(item => `
      <item>
        ${item.codigoMtx ? `<codigoMtx>${item.codigoMtx}</codigoMtx>` : ""}
        <codigo>${item.codigo}</codigo>
        <descripcion>${escapeXml(item.descripcion)}</descripcion>
        <cantidad>${item.cantidad.toFixed(6)}</cantidad>
        <codigoUnidadMedida>7</codigoUnidadMedida>
        <precioUnitario>${item.precioUnitario.toFixed(2)}</precioUnitario>
        <importeBonificacion>${(item.importeBonificacion || 0).toFixed(2)}</importeBonificacion>
        <codigoCondicionIVA>${esFactB ? 5 : item.codigoAlicuotaIVA}</codigoCondicionIVA>
        ${!esFactB ? `<importeIVA>${item.importeIVA.toFixed(2)}</importeIVA>` : ""}
        <importeItem>${(item.precioUnitario * item.cantidad).toFixed(2)}</importeItem>
      </item>`).join("")

  const subtotalesIVAXml = !esFactB
    ? buildSubtotalesIVA(request.items).map(s => `
      <subtotalIVA>
        <codigo>${s.codigo}</codigo>
        <importe>${s.importe.toFixed(2)}</importe>
      </subtotalIVA>`).join("")
    : ""

  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ser="http://impl.service.wsmtxca.afip.gov.ar/service/">
  <soapenv:Header/>
  <soapenv:Body>
    <ser:autorizarComprobanteRequest>
      <authRequest>
        <token>${credentials.token}</token>
        <sign>${credentials.sign}</sign>
        <cuitRepresentada>${cuit}</cuitRepresentada>
      </authRequest>
      <comprobanteCAERequest>
        <codigoTipoComprobante>${request.tipoComprobante}</codigoTipoComprobante>
        <numeroPuntoVenta>${request.puntoVenta}</numeroPuntoVenta>
        <numeroComprobante>${numero}</numeroComprobante>
        <fechaEmision>${request.fechaEmision}</fechaEmision>
        <codigoTipoDocumento>${esFactA ? 80 : 99}</codigoTipoDocumento>
        <numeroDocumento>${request.cuitReceptor || "0"}</numeroDocumento>
        <condicionIVAReceptor>${request.condicionIVAReceptor}</condicionIVAReceptor>
        <importeGravado>${totales.gravado.toFixed(2)}</importeGravado>
        <importeNoGravado>0.00</importeNoGravado>
        <importeExento>0.00</importeExento>
        <importeSubtotal>${totales.subtotal.toFixed(2)}</importeSubtotal>
        <importeOtrosTributos>0.00</importeOtrosTributos>
        <importeTotal>${totales.total.toFixed(2)}</importeTotal>
        <codigoMoneda>PES</codigoMoneda>
        <cotizacionMoneda>1</cotizacionMoneda>
        <codigoConcepto>1</codigoConcepto>
        <arrayItems>${itemsXml}
        </arrayItems>
        ${!esFactB && subtotalesIVAXml ? `<arraySubtotalesIVA>${subtotalesIVAXml}</arraySubtotalesIVA>` : ""}
        ${request.comprobantesAsociados?.length ? `<arrayComprobantesAsociados>${
          request.comprobantesAsociados.map(c => `
          <comprobanteAsociado>
            <codigoTipoComprobante>${c.tipoComprobante}</codigoTipoComprobante>
            <numeroPuntoVenta>${c.puntoVenta}</numeroPuntoVenta>
            <numeroComprobante>${c.numero}</numeroComprobante>
            <cuit>${c.cuit || "0"}</cuit>
            <fechaEmision>${c.fechaEmision}</fechaEmision>
          </comprobanteAsociado>`).join("")
        }</arrayComprobantesAsociados>` : ""}
        <arrayActividades>
          <actividad><codigo>${request.actividadAfip}</codigo></actividad>
        </arrayActividades>
      </comprobanteCAERequest>
    </ser:autorizarComprobanteRequest>
  </soapenv:Body>
</soapenv:Envelope>`

  const res = await fetch(WSMTXCA_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": '""' },
    body: soap,
  })

  const xml = await res.text()
  if (!res.ok) {
    const faultMatch = xml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/)
    const detail = faultMatch?.[1]?.trim() || xml.slice(0, 500)
    throw new Error(`WSMTXCA HTTP ${res.status}: ${detail}`)
  }
  return parseWsmtxcaResponse(xml, numero)
}

export async function consultarUltimoNumero(
  credentials: WSAACredentials,
  cuit: string,
  tipoComprobante: number,
  puntoVenta: number
): Promise<number> {
  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ser="http://impl.service.wsmtxca.afip.gov.ar/service/">
  <soapenv:Header/>
  <soapenv:Body>
    <ser:consultarUltimoComprobanteAutorizadoRequest>
      <authRequest>
        <token>${credentials.token}</token>
        <sign>${credentials.sign}</sign>
        <cuitRepresentada>${cuit}</cuitRepresentada>
      </authRequest>
      <codigoTipoComprobante>${tipoComprobante}</codigoTipoComprobante>
      <numeroPuntoVenta>${puntoVenta}</numeroPuntoVenta>
    </ser:consultarUltimoComprobanteAutorizadoRequest>
  </soapenv:Body>
</soapenv:Envelope>`

  const res = await fetch(WSMTXCA_URL, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": '""' },
    body: soap,
  })

  const xml = await res.text()
  if (!res.ok) {
    const faultMatch = xml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/)
    const detail = faultMatch?.[1]?.trim() || xml.slice(0, 500)
    throw new Error(`WSMTXCA HTTP ${res.status}: ${detail}`)
  }
  const numStr = extractTag(xml, "numeroComprobante")
  return parseInt(numStr || "0", 10)
}

// ─── Helpers internos ────────────────────────────────────────────────────────

function calcularTotales(items: InvoiceItem[], tipoComprobante: number) {
  const esFactB = tipoComprobante === 6 || tipoComprobante === 8
    || tipoComprobante === 11 || tipoComprobante === 13
  let subtotal = 0
  let iva = 0

  items.forEach(item => {
    const lineaTotal = item.precioUnitario * item.cantidad - (item.importeBonificacion || 0)
    subtotal += lineaTotal
    if (!esFactB) iva += item.importeIVA * item.cantidad
  })

  return {
    gravado: subtotal,
    subtotal,
    iva,
    total: esFactB ? subtotal : subtotal + iva,
  }
}

function buildSubtotalesIVA(items: InvoiceItem[]) {
  const map = new Map<number, number>()
  items.forEach(item => {
    const prev = map.get(item.codigoAlicuotaIVA) || 0
    map.set(item.codigoAlicuotaIVA, prev + item.importeIVA * item.cantidad)
  })
  return Array.from(map.entries()).map(([codigo, importe]) => ({ codigo, importe }))
}

function parseWsmtxcaResponse(xml: string, numero: number): InvoiceResult {
  const resultado = extractTag(xml, "resultado") || "R"
  const cae = extractTag(xml, "CAE") || ""
  const caeVence = extractTag(xml, "fechaVencimientoCAE") || ""

  const obsMatches = xml.matchAll(/<descripcion>([^<]+)<\/descripcion>/g)
  const observaciones = Array.from(obsMatches).map(m => m[1])

  if (resultado === "R") {
    throw new Error(`ARCA rechazó el comprobante: ${observaciones.join(", ")}`)
  }

  return { cae, caeVence, numero, resultado, observaciones }
}

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))
  return match?.[1]?.trim() || ""
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

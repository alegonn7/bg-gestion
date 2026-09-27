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

// ─── ASN.1 DER helpers ──────────────────────────────────────────────────────

function u8concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0)
  const r = new Uint8Array(total)
  let o = 0
  for (const a of arrays) { r.set(a, o); o += a.length }
  return r
}

function derTlv(tag: number, data: Uint8Array): Uint8Array {
  const len = data.length
  let lb: Uint8Array
  if (len < 128) lb = new Uint8Array([len])
  else if (len < 256) lb = new Uint8Array([0x81, len])
  else lb = new Uint8Array([0x82, len >> 8, len & 0xff])
  return u8concat(new Uint8Array([tag]), lb, data)
}

const derSeq = (...a: Uint8Array[]) => derTlv(0x30, u8concat(...a))
const derSet = (...a: Uint8Array[]) => derTlv(0x31, u8concat(...a))
const derCtx0 = (a: Uint8Array) => derTlv(0xa0, a)
const derOctet = (a: Uint8Array) => derTlv(0x04, a)
const derInt = (a: Uint8Array) => derTlv(0x02, a)
const derOid = (a: Uint8Array) => derTlv(0x06, a)
const derNull = () => new Uint8Array([0x05, 0x00])

// OID value bytes (sin tag/length)
const OID_SHA1       = new Uint8Array([0x2b, 0x0e, 0x03, 0x02, 0x1a])
const OID_SHA1_RSA   = new Uint8Array([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x05])
const OID_DATA       = new Uint8Array([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x01])
const OID_SIGNED     = new Uint8Array([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02])

function hexToU8(hex: string): Uint8Array {
  const h = hex.length % 2 ? '0' + hex : hex
  const r = new Uint8Array(h.length / 2)
  for (let i = 0; i < r.length; i++) r[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  return r
}

function strToU8(s: string): Uint8Array {
  return Uint8Array.from(s, c => c.charCodeAt(0))
}

// ─── DER helpers para extracción de issuer ──────────────────────────────────

function derGetLength(data: Uint8Array, pos: number): { len: number; used: number } {
  if (data[pos] < 0x80) return { len: data[pos], used: 1 }
  const n = data[pos] & 0x7f
  let len = 0
  for (let i = 0; i < n; i++) len = (len << 8) | data[pos + 1 + i]
  return { len, used: 1 + n }
}

function derSkipTLV(data: Uint8Array, pos: number): number {
  pos++
  const { len, used } = derGetLength(data, pos)
  return pos + used + len
}

function derExtractTLV(data: Uint8Array, pos: number): Uint8Array {
  const start = pos
  pos++
  const { len, used } = derGetLength(data, pos)
  return data.slice(start, pos + used + len)
}

function enterSequence(data: Uint8Array, pos: number): number {
  pos++  // skip tag
  pos += derGetLength(data, pos).used  // skip length
  return pos
}

function extractIssuerFromCertDer(certDer: Uint8Array): Uint8Array {
  let pos = enterSequence(certDer, 0)           // enter Certificate
  pos = enterSequence(certDer, pos)             // enter TBSCertificate
  if (certDer[pos] === 0xa0) pos = derSkipTLV(certDer, pos)  // skip version
  pos = derSkipTLV(certDer, pos)                // skip serial
  pos = derSkipTLV(certDer, pos)                // skip sigAlg
  return derExtractTLV(certDer, pos)            // issuer
}

function extractSPKIFromCertDer(certDer: Uint8Array): Uint8Array {
  let pos = enterSequence(certDer, 0)           // enter Certificate
  pos = enterSequence(certDer, pos)             // enter TBSCertificate
  if (certDer[pos] === 0xa0) pos = derSkipTLV(certDer, pos)  // skip version
  pos = derSkipTLV(certDer, pos)                // skip serial
  pos = derSkipTLV(certDer, pos)                // skip sigAlg
  pos = derSkipTLV(certDer, pos)                // skip issuer
  pos = derSkipTLV(certDer, pos)                // skip validity
  pos = derSkipTLV(certDer, pos)                // skip subject
  return derExtractTLV(certDer, pos)            // SPKI
}

// ─── Firmar TRA con SubtleCrypto + PKCS#7 manual ────────────────────────────

export async function signTRA(certPem: string, keyPem: string): Promise<string> {
  const now = new Date()
  const genTime = new Date(now.getTime() - 10 * 60 * 1000)
  const expTime = new Date(now.getTime() + 10 * 60 * 1000)

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
  <service>wsfe</service>
</loginTicketRequest>`

  // Parsear cert con forge para extraer DER y serial
  const forgeCert = forge.pki.certificateFromPem(certPem)
  const certAsn1 = forge.pki.certificateToAsn1(forgeCert) as any
  const certDer = strToU8(forge.asn1.toDer(certAsn1).getBytes())

  // Extraer issuer DER directamente del DER crudo (más confiable que el árbol forge)
  const issuerDer = extractIssuerFromCertDer(certDer)

  // Serial como INTEGER bytes
  const serialRaw = hexToU8(forgeCert.serialNumber)
  const serialInt = serialRaw[0] & 0x80 ? u8concat(new Uint8Array([0x00]), serialRaw) : serialRaw

  // Convertir clave RSA privada a PKCS#8 para SubtleCrypto
  const forgeKey = forge.pki.privateKeyFromPem(keyPem)
  const pkcs8Asn1 = forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(forgeKey))
  const pkcs8Der = strToU8(forge.asn1.toDer(pkcs8Asn1).getBytes())

  // Importar clave con SubtleCrypto
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8Der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' },
    false,
    ['sign']
  )

  // Firmar el contenido del TRA
  const contentBytes = new TextEncoder().encode(traXml)
  const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, contentBytes)
  const sig = new Uint8Array(sigBuf)

  // Verificar localmente si la firma es válida (cert y key deben coincidir)
  try {
    const spkiDer = extractSPKIFromCertDer(certDer)
    const pubKey = await crypto.subtle.importKey('spki', spkiDer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-1' }, false, ['verify'])
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pubKey, sig.buffer as ArrayBuffer, contentBytes.buffer as ArrayBuffer)
    console.log('[WSAA] keyPem header:', keyPem.split('\n')[0])
    console.log('[WSAA] self-verify (cert/key match):', valid)
  } catch (e) {
    console.log('[WSAA] self-verify error:', (e as Error).message)
  }

  // Construir PKCS#7 CMS SignedData manualmente
  const algoSha1    = derSeq(derOid(OID_SHA1), derNull())
  const algoSha1Rsa = derSeq(derOid(OID_SHA1_RSA), derNull())

  const encapContentInfo = derSeq(
    derOid(OID_DATA),
    derCtx0(derOctet(contentBytes))
  )

  const issuerAndSerial = derSeq(issuerDer, derInt(serialInt))

  const signerInfo = derSeq(
    derInt(new Uint8Array([0x01])),
    issuerAndSerial,
    algoSha1,
    algoSha1Rsa,
    derOctet(sig)
  )

  const signedData = derSeq(
    derInt(new Uint8Array([0x01])),
    derSet(algoSha1),
    encapContentInfo,
    derTlv(0xa0, certDer),
    derSet(signerInfo)
  )

  const contentInfo = derSeq(
    derOid(OID_SIGNED),
    derCtx0(signedData)
  )

  let bin = ''
  for (const b of contentInfo) bin += String.fromCharCode(b)
  return btoa(bin)
}

// ─── WSAA — obtener token ────────────────────────────────────────────────────

export async function getWSAAToken(
  certPem: string,
  keyPem: string
): Promise<WSAACredentials> {
  const cms = await signTRA(certPem, keyPem)

  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <in0>${cms}</in0>
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

function logTokenRelations(token: string) {
  try {
    const decoded = atob(token)
    const relations = Array.from(decoded.matchAll(/<relation key="([^"]+)" reltype="([^"]+)"/g))
      .map(m => `CUIT ${m[1]} (reltype ${m[2]})`)
    console.log("[WSAA] relaciones en token:", relations.length ? relations.join(", ") : "NINGUNA")
  } catch { /* ignore */ }
}

export function logWSAATokenRelations(token: string) {
  logTokenRelations(token)
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

  logTokenRelations(token)
  return { token, sign, expires: new Date(expStr) }
}

// ─── WSFEv1 — emitir comprobante ────────────────────────────────────────────

const WSFEV1_URL = "https://servicios1.afip.gov.ar/wsfev1/service.asmx"
const WSFEV1_NS  = "http://ar.gov.afip.dif.FEV1/"

export async function consultarUltimoNumero(
  credentials: WSAACredentials,
  cuit: string,
  tipoComprobante: number,
  puntoVenta: number
): Promise<number> {
  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${WSFEV1_NS}">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECompUltimoAutorizado>
      <ar:Auth>
        <ar:Token>${credentials.token}</ar:Token>
        <ar:Sign>${credentials.sign}</ar:Sign>
        <ar:Cuit>${cuit}</ar:Cuit>
      </ar:Auth>
      <ar:PtoVta>${puntoVenta}</ar:PtoVta>
      <ar:CbteTipo>${tipoComprobante}</ar:CbteTipo>
    </ar:FECompUltimoAutorizado>
  </soapenv:Body>
</soapenv:Envelope>`

  console.log("[WSFEv1] consultarUltimoNumero — cuit:", cuit, "tipoComprobante:", tipoComprobante, "puntoVenta:", puntoVenta)

  const res = await fetch(WSFEV1_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": `${WSFEV1_NS}FECompUltimoAutorizado`,
    },
    body: soap,
  })

  const xml = await res.text()
  console.log("[WSFEv1] consultarUltimoNumero response:", xml.slice(0, 1000))

  if (!res.ok) {
    const faultMatch = xml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/)
    const detail = faultMatch?.[1]?.trim() || xml.slice(0, 500)
    throw new Error(`WSFEv1 HTTP ${res.status}: ${detail}`)
  }

  const errCode = extractTag(xml, "Code")
  if (errCode) {
    throw new Error(`WSFEv1 error ${errCode}: ${extractTag(xml, "Msg")}`)
  }

  return parseInt(extractTag(xml, "CbteNro") || "0", 10)
}

export async function autorizarComprobante(
  credentials: WSAACredentials,
  cuit: string,
  request: InvoiceRequest,
  ultimoNumero: number
): Promise<InvoiceResult> {
  const numero = ultimoNumero + 1
  const totales = calcularTotales(request.items, request.tipoComprobante)
  const esFactA = request.tipoComprobante === 1 || request.tipoComprobante === 3

  // Fecha en formato YYYYMMDD (sin guiones)
  const fechaFmt = request.fechaEmision.replace(/-/g, "")

  // IVA breakdown — solo para Factura A
  let ivaXml = ""
  if (esFactA && totales.iva > 0) {
    const subtotales = buildSubtotalesIVA(request.items)
    ivaXml = `<Iva>${subtotales.map(s => `
        <AlicIva>
          <Id>${s.codigo}</Id>
          <BaseImp>${s.baseImp.toFixed(2)}</BaseImp>
          <Importe>${s.importe.toFixed(2)}</Importe>
        </AlicIva>`).join("")}
      </Iva>`
  }

  // Comprobantes asociados (notas de crédito/débito)
  let cbtesAsocXml = ""
  if (request.comprobantesAsociados?.length) {
    cbtesAsocXml = `<CbtesAsoc>${request.comprobantesAsociados.map(c => `
        <CbteAsoc>
          <Tipo>${c.tipoComprobante}</Tipo>
          <PtoVta>${c.puntoVenta}</PtoVta>
          <Nro>${c.numero}</Nro>
          ${c.cuit ? `<Cuit>${c.cuit}</Cuit>` : ""}
        </CbteAsoc>`).join("")}
      </CbtesAsoc>`
  }

  const soap = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${WSFEV1_NS}">
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECAESolicitar>
      <ar:Auth>
        <ar:Token>${credentials.token}</ar:Token>
        <ar:Sign>${credentials.sign}</ar:Sign>
        <ar:Cuit>${cuit}</ar:Cuit>
      </ar:Auth>
      <ar:FeCAEReq>
        <ar:FeCabReq>
          <ar:CantReg>1</ar:CantReg>
          <ar:PtoVta>${request.puntoVenta}</ar:PtoVta>
          <ar:CbteTipo>${request.tipoComprobante}</ar:CbteTipo>
        </ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>1</ar:Concepto>
            <ar:DocTipo>${esFactA ? 80 : 99}</ar:DocTipo>
            <ar:DocNro>${esFactA ? (request.cuitReceptor || "0") : "0"}</ar:DocNro>
            <ar:CbteDesde>${numero}</ar:CbteDesde>
            <ar:CbteHasta>${numero}</ar:CbteHasta>
            <ar:CbteFch>${fechaFmt}</ar:CbteFch>
            <ar:ImpTotal>${totales.total.toFixed(2)}</ar:ImpTotal>
            <ar:ImpTotConc>0.00</ar:ImpTotConc>
            <ar:ImpNeto>${totales.gravado.toFixed(2)}</ar:ImpNeto>
            <ar:ImpOpEx>0.00</ar:ImpOpEx>
            <ar:ImpTrib>0.00</ar:ImpTrib>
            <ar:ImpIVA>${totales.iva.toFixed(2)}</ar:ImpIVA>
            <ar:MonId>PES</ar:MonId>
            <ar:MonCotiz>1.000000</ar:MonCotiz>
            ${ivaXml}
            ${cbtesAsocXml}
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soapenv:Body>
</soapenv:Envelope>`

  const res = await fetch(WSFEV1_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": `${WSFEV1_NS}FECAESolicitar`,
    },
    body: soap,
  })

  const xml = await res.text()
  if (!res.ok) {
    const faultMatch = xml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/)
    const detail = faultMatch?.[1]?.trim() || xml.slice(0, 500)
    throw new Error(`WSFEv1 HTTP ${res.status}: ${detail}`)
  }

  return parseWsfeResponse(xml, numero)
}

// ─── Helpers internos ────────────────────────────────────────────────────────

function calcularTotales(items: InvoiceItem[], tipoComprobante: number) {
  const esFactA = tipoComprobante === 1 || tipoComprobante === 3
  let subtotal = 0
  let iva = 0

  items.forEach(item => {
    const lineaTotal = item.precioUnitario * item.cantidad - (item.importeBonificacion || 0)
    subtotal += lineaTotal
    if (esFactA) iva += item.importeIVA * item.cantidad
  })

  return {
    gravado: subtotal,
    subtotal,
    iva,
    total: esFactA ? subtotal + iva : subtotal,
  }
}

function buildSubtotalesIVA(items: InvoiceItem[]) {
  const map = new Map<number, { baseImp: number; importe: number }>()
  items.forEach(item => {
    const prev = map.get(item.codigoAlicuotaIVA) || { baseImp: 0, importe: 0 }
    const lineaTotal = item.precioUnitario * item.cantidad - (item.importeBonificacion || 0)
    map.set(item.codigoAlicuotaIVA, {
      baseImp: prev.baseImp + lineaTotal,
      importe: prev.importe + item.importeIVA * item.cantidad,
    })
  })
  return Array.from(map.entries()).map(([codigo, v]) => ({ codigo, ...v }))
}

function parseWsfeResponse(xml: string, numero: number): InvoiceResult {
  const resultado = extractTag(xml, "Resultado") || "R"
  const cae       = extractTag(xml, "CAE") || ""
  const caeVenceRaw = extractTag(xml, "CAEFchVto") || ""

  // Convertir YYYYMMDD → YYYY-MM-DD
  const caeVence = caeVenceRaw.length === 8
    ? `${caeVenceRaw.slice(0, 4)}-${caeVenceRaw.slice(4, 6)}-${caeVenceRaw.slice(6, 8)}`
    : caeVenceRaw

  const errores = Array.from(xml.matchAll(/<Err[^>]*>[\s\S]*?<Msg>([^<]+)<\/Msg>/g)).map(m => m[1])
  const observaciones = Array.from(xml.matchAll(/<Obs[^>]*>[\s\S]*?<Msg>([^<]+)<\/Msg>/g)).map(m => m[1])

  if (resultado === "R" || !cae) {
    throw new Error(`ARCA rechazó el comprobante: ${[...errores, ...observaciones].join(", ")}`)
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

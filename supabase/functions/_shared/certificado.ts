// Certificado digital de ARCA tramitado a mano por el cliente (alta sin automatizaciones).
// Acá se generan la clave privada y el pedido de certificado (CSR) igual que en el tutorial
// oficial (openssl genrsa -traditional 2048 + openssl req -subj "/C=AR/O=.../CN=.../serialNumber=CUIT ..."),
// y se controla que el certificado que el cliente descarga de ARCA corresponda a esa clave.

// ─── DER mínimo ──────────────────────────────────────────────────────────────

const SEQUENCE = 0x30
const SET = 0x31
const PRINTABLE_STRING = 0x13
const UTF8_STRING = 0x0c

function juntar(...partes: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const salida = new Uint8Array(partes.reduce((total, p) => total + p.length, 0))
  let i = 0
  for (const parte of partes) {
    salida.set(parte, i)
    i += parte.length
  }
  return salida
}

function largo(n: number): Uint8Array {
  if (n < 0x80) return Uint8Array.of(n)
  const bytes: number[] = []
  for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v & 0xff)
  return Uint8Array.of(0x80 | bytes.length, ...bytes)
}

function tlv(tag: number, ...contenido: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const cuerpo = juntar(...contenido)
  return juntar(Uint8Array.of(tag), largo(cuerpo.length), cuerpo)
}

function oid(texto: string): Uint8Array {
  const [a, b, ...resto] = texto.split(".").map(Number)
  const bytes = [40 * a + b]
  for (const n of resto) {
    const grupo = [n & 0x7f]
    for (let v = Math.floor(n / 128); v > 0; v = Math.floor(v / 128)) grupo.unshift((v & 0x7f) | 0x80)
    bytes.push(...grupo)
  }
  return tlv(0x06, Uint8Array.from(bytes))
}

interface Nodo {
  tag: number
  desde: number   // donde empieza el elemento (tag)
  inicio: number  // donde empieza su contenido
  fin: number
}

function leer(bytes: Uint8Array, desde: number): Nodo {
  if (desde + 2 > bytes.length) throw new Error("Archivo incompleto")
  const tag = bytes[desde]
  let i = desde + 1
  let n = bytes[i++]
  if (n & 0x80) {
    const cantidad = n & 0x7f
    n = 0
    for (let k = 0; k < cantidad; k++) n = n * 256 + bytes[i++]
  }
  if (i + n > bytes.length) throw new Error("Archivo incompleto")
  return { tag, desde, inicio: i, fin: i + n }
}

function hijos(bytes: Uint8Array, nodo: Nodo): Nodo[] {
  const lista: Nodo[] = []
  for (let i = nodo.inicio; i < nodo.fin;) {
    const hijo = leer(bytes, i)
    lista.push(hijo)
    i = hijo.fin
  }
  return lista
}

// ─── PEM ─────────────────────────────────────────────────────────────────────

function aBase64(bytes: Uint8Array): string {
  let binario = ""
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binario)
}

function deBase64(texto: string): Uint8Array {
  return Uint8Array.from(atob(texto.replace(/\s+/g, "")), (c) => c.charCodeAt(0))
}

function aPem(der: Uint8Array, tipo: string): string {
  const lineas = aBase64(der).match(/.{1,64}/g) ?? []
  return `-----BEGIN ${tipo}-----\n${lineas.join("\n")}\n-----END ${tipo}-----\n`
}

function dePem(pem: string, tipo: string): Uint8Array | null {
  const partes = pem.match(new RegExp(`-----BEGIN ${tipo}-----([\\s\\S]+?)-----END ${tipo}-----`))
  return partes ? deBase64(partes[1]) : null
}

// ─── Pedido de certificado ───────────────────────────────────────────────────

// ARCA pide "solo letras y números" en el nombre del certificado; la razón social va sin acentos
function textoSimple(texto: string, maximo: number): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 .,&-]/g, "").replace(/\s+/g, " ").trim().slice(0, maximo)
}

export interface PedidoDeCertificado {
  csr: string    // PEM "CERTIFICATE REQUEST": lo que el cliente sube en ARCA
  clave: string  // PEM "RSA PRIVATE KEY" (PKCS#1, como openssl genrsa -traditional): no sale del servidor
}

export async function crearPedidoDeCertificado(datos: { cuit: string; razonSocial: string; alias: string }): Promise<PedidoDeCertificado> {
  const claves = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )
  const clavePublica = new Uint8Array(await crypto.subtle.exportKey("spki", claves.publicKey))
  const atributo = (id: string, tag: number, valor: string) =>
    tlv(SET, tlv(SEQUENCE, oid(id), tlv(tag, new TextEncoder().encode(valor))))

  const datosDelPedido = tlv(
    SEQUENCE,
    Uint8Array.of(0x02, 0x01, 0x00), // versión 0
    tlv(
      SEQUENCE,
      atributo("2.5.4.6", PRINTABLE_STRING, "AR"),
      atributo("2.5.4.10", UTF8_STRING, textoSimple(datos.razonSocial, 64) || "Sin nombre"),
      atributo("2.5.4.3", UTF8_STRING, datos.alias),
      atributo("2.5.4.5", PRINTABLE_STRING, `CUIT ${datos.cuit}`),
    ),
    clavePublica,
    Uint8Array.of(0xa0, 0x00), // sin atributos
  )
  const firma = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", claves.privateKey, datosDelPedido))
  const sha256ConRsa = tlv(SEQUENCE, oid("1.2.840.113549.1.1.11"), Uint8Array.of(0x05, 0x00))
  const csr = tlv(SEQUENCE, datosDelPedido, sha256ConRsa, tlv(0x03, Uint8Array.of(0x00), firma))

  // WebCrypto exporta PKCS#8: la clave RSA (PKCS#1) es el OCTET STRING de adentro
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", claves.privateKey))
  const [, , claveRsa] = hijos(pkcs8, leer(pkcs8, 0))
  if (claveRsa?.tag !== 0x04) throw new Error("No se pudo generar la clave del certificado")

  return {
    csr: aPem(csr, "CERTIFICATE REQUEST"),
    clave: aPem(pkcs8.slice(claveRsa.inicio, claveRsa.fin), "RSA PRIVATE KEY"),
  }
}

// ─── Certificado que devuelve ARCA ───────────────────────────────────────────

export interface CertificadoLeido {
  pem: string
  clavePublica: Uint8Array
  vence: Date
  sujeto: string   // textos del titular, por ejemplo "AR, Mi Negocio, bggestion123, CUIT 20123456789"
}

// El archivo que se baja de ARCA viene en texto (PEM); también se acepta binario (DER)
export function leerCertificado(archivo: Uint8Array): CertificadoLeido {
  const texto = new TextDecoder().decode(archivo)
  const der = texto.includes("-----BEGIN CERTIFICATE-----") ? dePem(texto, "CERTIFICATE") : archivo[0] === SEQUENCE ? archivo : null
  if (!der) throw new ArchivoNoValido()

  try {
    const [datos] = hijos(der, leer(der, 0))
    let campos = hijos(der, datos)
    if (campos[0]?.tag === 0xa0) campos = campos.slice(1) // versión
    const [, , , validez, titular, clavePublica] = campos
    const [, vence] = hijos(der, validez)
    return {
      pem: aPem(der, "CERTIFICATE"),
      clavePublica: der.slice(clavePublica.desde, clavePublica.fin),
      vence: fecha(der, vence),
      sujeto: textos(der, titular).join(", "),
    }
  } catch {
    throw new ArchivoNoValido()
  }
}

export class ArchivoNoValido extends Error {
  constructor() {
    super("El archivo no es un certificado")
  }
}

// Clave pública del pedido de certificado (para compararla con la del certificado)
export function clavePublicaDelPedido(csrPem: string): Uint8Array {
  const der = dePem(csrPem, "CERTIFICATE REQUEST")
  if (!der) throw new Error("Pedido de certificado inválido")
  const [datos] = hijos(der, leer(der, 0))
  const [, , clavePublica] = hijos(der, datos)
  return der.slice(clavePublica.desde, clavePublica.fin)
}

export function mismosBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i])
}

// Misma clave pública en el certificado y en el pedido: se compara la clave en sí (el BIT STRING),
// sin depender de cómo cada uno escribió el algoritmo
export function mismaClavePublica(a: Uint8Array, b: Uint8Array): boolean {
  const clave = (spki: Uint8Array) => {
    const [, bits] = hijos(spki, leer(spki, 0))
    return bits?.tag === 0x03 ? spki.slice(bits.inicio, bits.fin) : spki
  }
  try {
    return mismosBytes(clave(a), clave(b))
  } catch {
    return mismosBytes(a, b)
  }
}

function textos(bytes: Uint8Array, nodo: Nodo): string[] {
  if ([0x0c, 0x13, 0x14, 0x16].includes(nodo.tag)) return [new TextDecoder().decode(bytes.slice(nodo.inicio, nodo.fin))]
  if (nodo.tag === SEQUENCE || nodo.tag === SET) return hijos(bytes, nodo).flatMap((hijo) => textos(bytes, hijo))
  return []
}

// UTCTime (AAMMDDhhmmssZ) o GeneralizedTime (AAAAMMDDhhmmssZ)
function fecha(bytes: Uint8Array, nodo: Nodo): Date {
  const texto = new TextDecoder().decode(bytes.slice(nodo.inicio, nodo.fin))
  const completo = nodo.tag === 0x17 ? `${Number(texto.slice(0, 2)) < 50 ? "20" : "19"}${texto}` : texto
  const [, a, m, d, h, min, s] = completo.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/) ?? []
  if (!a) throw new Error("Fecha inválida")
  return new Date(Date.UTC(Number(a), Number(m) - 1, Number(d), Number(h), Number(min), Number(s)))
}

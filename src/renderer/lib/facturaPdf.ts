// PDF de comprobantes electrónicos (facturas y notas de crédito/débito A, B y C) con el formato
// de los comprobantes de ARCA: letra y código, datos del emisor y del receptor, detalle, totales,
// CAE y código QR (RG 4291). En modo prueba lleva la marca "SIN VALIDEZ FISCAL".

import jsPDF from 'jspdf'
import QRCode from 'qrcode'
import type { FiscalComprobante, FiscalConfig } from '@/store/fiscal'

export interface EmisorPdf {
  razonSocial: string
  nombreFantasia?: string | null
  cuit: string
  condicionIva: string                 // 'RI' | 'Monotributo' | 'Exento'
  domicilioComercial?: string | null
  ingresosBrutos?: string | null
  inicioActividades?: string | null    // YYYY-MM-DD
  logo?: HTMLImageElement | string | null
}

export interface ItemPdf {
  codigo: string
  descripcion: string
  cantidad: number
  precioUnitario: number               // SIN IVA en A; CON IVA en B y C
  importeBonificacion?: number
  codigoAlicuotaIVA: number
  importeIVA: number                   // IVA por unidad, ya bonificado (solo A)
}

export interface ComprobantePdf {
  tipo: number
  puntoVenta: number
  numero: number
  fecha: string                        // YYYY-MM-DD
  cae: string
  caeVence: string                     // YYYY-MM-DD
  docTipo: number | null
  docNro: string | null
  razonSocialReceptor: string | null
  condicionIvaReceptor: number | null
  condicionVenta?: string
  items: ItemPdf[] | null
  alicuotas: { Id: number; BaseImp: number; Importe: number }[] | null
  neto: number
  iva: number
  total: number
  asociado?: { tipo: number; puntoVenta: number; numero: number; fecha: string } | null
  prueba: boolean
}

// ─── Textos ARCA ─────────────────────────────────────────────────────────────

const NOMBRE_COMPROBANTE: Record<number, string> = {
  1: 'FACTURA', 2: 'NOTA DE DÉBITO', 3: 'NOTA DE CRÉDITO',
  6: 'FACTURA', 7: 'NOTA DE DÉBITO', 8: 'NOTA DE CRÉDITO',
  11: 'FACTURA', 12: 'NOTA DE DÉBITO', 13: 'NOTA DE CRÉDITO',
}
export const CONDICION_EMISOR: Record<string, string> = {
  RI: 'IVA Responsable Inscripto',
  Monotributo: 'Responsable Monotributo',
  Exento: 'IVA Sujeto Exento',
}
const CONDICION_RECEPTOR: Record<number, string> = {
  1: 'IVA Responsable Inscripto',
  4: 'IVA Sujeto Exento',
  5: 'Consumidor Final',
  6: 'Responsable Monotributo',
  7: 'Sujeto No Categorizado',
  13: 'Monotributista Social',
}
export const DOCUMENTO: Record<number, string> = { 80: 'CUIT', 86: 'CUIL', 96: 'DNI' }
const TASA: Record<number, string> = { 3: '0%', 4: '10,5%', 5: '21%', 6: '27%', 8: '5%', 9: '2,5%' }
// Orden en que ARCA lista el IVA por alícuota en la Factura A
const ORDEN_ALICUOTAS = [6, 5, 4, 8, 9, 3]

const letraDe = (tipo: number) => (tipo <= 3 ? 'A' : tipo <= 8 ? 'B' : 'C')
const nombreCorto = (tipo: number) => `${NOMBRE_COMPROBANTE[tipo] ?? 'COMPROBANTE'} ${letraDe(tipo)}`
  .replace('NOTA DE DÉBITO', 'Nota de Débito').replace('NOTA DE CRÉDITO', 'Nota de Crédito').replace('FACTURA', 'Factura')

// ─── Formatos ────────────────────────────────────────────────────────────────

const importe = (n: number) =>
  new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
export const fechaAR = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')
export const cuitConGuiones = (cuit: string) =>
  cuit.length === 11 ? `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}` : cuit
const numeroComprobante = (puntoVenta: number, numero: number) =>
  `${String(puntoVenta).padStart(5, '0')}-${String(numero).padStart(8, '0')}`

// ─── Página ──────────────────────────────────────────────────────────────────

const MARGEN = 10
const ANCHO = 190
const FIN_DETALLE = 218     // hasta acá entran filas de detalle; abajo van totales y CAE

// Etiqueta en negrita seguida del valor, recortado si no entra en el ancho disponible
export function campo(doc: jsPDF, etiqueta: string, valor: string, x: number, y: number, anchoMax = 90) {
  doc.setFont('helvetica', 'bold')
  doc.text(etiqueta, x, y)
  const ancho = doc.getTextWidth(`${etiqueta} `)
  doc.setFont('helvetica', 'normal')
  let texto = valor || ''
  while (texto.length > 3 && doc.getTextWidth(texto) > anchoMax - ancho) texto = `${texto.slice(0, -4)}...`
  doc.text(texto, x + ancho, y)
}

function dibujarEncabezado(doc: jsPDF, emisor: EmisorPdf, cbte: ComprobantePdf, logo: HTMLImageElement | string | null) {
  const letra = letraDe(cbte.tipo)
  doc.setDrawColor(0)
  doc.setLineWidth(0.3)
  doc.setTextColor(0)

  // ORIGINAL
  doc.rect(MARGEN, 10, ANCHO, 8)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('ORIGINAL', 105, 15.5, { align: 'center' })

  // Recuadro principal, dividido al medio por la letra
  doc.rect(MARGEN, 18, ANCHO, 48)
  doc.line(105, 34, 105, 66)
  doc.setFillColor(255, 255, 255)
  doc.rect(97, 18, 16, 16, 'FD')
  doc.setFontSize(24)
  doc.text(letra, 105, 28.5, { align: 'center' })
  doc.setFontSize(6.5)
  doc.text(`COD. ${String(cbte.tipo).padStart(3, '0')}`, 105, 32.3, { align: 'center' })

  // Emisor (izquierda)
  let yNombre = 30
  if (logo) {
    try {
      const props = typeof logo === 'string' ? doc.getImageProperties(logo) : { width: logo.width, height: logo.height }
      const escala = Math.min(40 / props.width, 13 / props.height)
      doc.addImage(logo, 'PNG', 13, 20, props.width * escala, props.height * escala)
      yNombre = 20 + props.height * escala + 5
    } catch {
      // Si el logo no se puede dibujar, el comprobante sale sin él
    }
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(yNombre > 30 ? 11 : 14)
  const nombre = doc.splitTextToSize(emisor.nombreFantasia || emisor.razonSocial, 80).slice(0, 2)
  doc.text(nombre, 13, yNombre)

  doc.setFontSize(8)
  campo(doc, 'Razón Social:', emisor.razonSocial, 13, 51, 88)
  campo(doc, 'Domicilio Comercial:', emisor.domicilioComercial || '', 13, 56, 88)
  campo(doc, 'Condición frente al IVA:', CONDICION_EMISOR[emisor.condicionIva] ?? emisor.condicionIva, 13, 61, 88)

  // Comprobante (derecha)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(NOMBRE_COMPROBANTE[cbte.tipo] ?? 'COMPROBANTE', 116, 27)
  doc.setFontSize(9)
  doc.text(`Punto de Venta: ${String(cbte.puntoVenta).padStart(5, '0')}      Comp. Nro: ${String(cbte.numero).padStart(8, '0')}`, 116, 36)
  doc.text(`Fecha de Emisión: ${fechaAR(cbte.fecha)}`, 116, 42)
  doc.setFontSize(8)
  campo(doc, 'CUIT:', cuitConGuiones(emisor.cuit), 116, 51, 82)
  campo(doc, 'Ingresos Brutos:', emisor.ingresosBrutos || '', 116, 56, 82)
  campo(doc, 'Fecha de Inicio de Actividades:', fechaAR(emisor.inicioActividades), 116, 61, 82)

  // Receptor
  doc.rect(MARGEN, 68, ANCHO, 24)
  const identificado = cbte.docTipo && cbte.docTipo !== 99 && cbte.docNro
  const documento = identificado
    ? `${DOCUMENTO[cbte.docTipo!] ?? 'Doc.'}: ${cbte.docTipo === 80 ? cuitConGuiones(cbte.docNro!) : cbte.docNro}`
    : 'Doc.: -'
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text(documento, 13, 74)
  campo(doc, 'Apellido y Nombre / Razón Social:', cbte.razonSocialReceptor || (identificado ? '' : 'Consumidor Final'), 70, 74, 128)
  campo(doc, 'Condición frente al IVA:', CONDICION_RECEPTOR[cbte.condicionIvaReceptor ?? 5] ?? '', 13, 80, 90)
  campo(doc, 'Condición de venta:', cbte.condicionVenta || 'Contado', 13, 86, 90)
  if (cbte.asociado) {
    const a = cbte.asociado
    campo(doc, 'Comprobante asociado:', `${nombreCorto(a.tipo)} ${numeroComprobante(a.puntoVenta, a.numero)} del ${fechaAR(a.fecha)}`, 105, 86, 93)
  }
}

interface Columna { titulo: string; x: number; alinear: 'left' | 'right' }

function columnasDe(letra: string): Columna[] {
  return letra === 'A'
    ? [
      { titulo: 'Código', x: 12, alinear: 'left' },
      { titulo: 'Producto / Servicio', x: 31.5, alinear: 'left' },
      { titulo: 'Cantidad', x: 97, alinear: 'right' },
      { titulo: 'U. Medida', x: 99, alinear: 'left' },
      { titulo: 'Precio Unit.', x: 132, alinear: 'right' },
      { titulo: '% Bonif', x: 144, alinear: 'right' },
      { titulo: 'Subtotal', x: 163, alinear: 'right' },
      { titulo: 'Alícuota IVA', x: 179, alinear: 'right' },
      { titulo: 'Subtotal c/IVA', x: 198, alinear: 'right' },
    ]
    : [
      { titulo: 'Código', x: 12, alinear: 'left' },
      { titulo: 'Producto / Servicio', x: 31.5, alinear: 'left' },
      { titulo: 'Cantidad', x: 115, alinear: 'right' },
      { titulo: 'U. Medida', x: 118, alinear: 'left' },
      { titulo: 'Precio Unit.', x: 152, alinear: 'right' },
      { titulo: '% Bonif', x: 166, alinear: 'right' },
      { titulo: 'Imp. Bonif.', x: 181, alinear: 'right' },
      { titulo: 'Subtotal', x: 198, alinear: 'right' },
    ]
}

function dibujarTitulosDetalle(doc: jsPDF, columnas: Columna[]) {
  doc.setFillColor(225, 225, 225)
  doc.rect(MARGEN, 95, ANCHO, 7, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.8)
  for (const c of columnas) doc.text(c.titulo, c.x, 99.6, { align: c.alinear })
}

function filasDe(letra: string, items: ItemPdf[], total: number): string[][] {
  if (!items.length) {
    // Comprobantes sin detalle guardado: una sola línea por el total
    return [letra === 'A'
      ? ['-', 'Según comprobante', '1,00', 'unidades', importe(total), '0,00', importe(total), '-', importe(total)]
      : ['-', 'Según comprobante', '1,00', 'unidades', importe(total), '0,00', '0,00', importe(total)]]
  }
  return items.map((i) => {
    const codigo = (i.codigo || '-').slice(0, 13) // entra un código de barras EAN-13
    const cantidad = importe(i.cantidad)
    const bruto = i.precioUnitario * i.cantidad
    const bonificacion = i.importeBonificacion ?? 0
    const porcentaje = bruto > 0 ? (bonificacion / bruto) * 100 : 0
    const subtotal = bruto - bonificacion
    return letra === 'A'
      ? [codigo, i.descripcion, cantidad, 'unidades', importe(i.precioUnitario), importe(porcentaje), importe(subtotal),
        TASA[i.codigoAlicuotaIVA] ?? '-', importe(subtotal + i.importeIVA * i.cantidad)]
      : [codigo, i.descripcion, cantidad, 'unidades', importe(i.precioUnitario), importe(porcentaje), importe(bonificacion), importe(subtotal)]
  })
}

function dibujarTotales(doc: jsPDF, cbte: ComprobantePdf) {
  const letra = letraDe(cbte.tipo)
  doc.setDrawColor(0)
  doc.rect(MARGEN, 222, ANCHO, 40)
  doc.setFontSize(8.5)

  const renglon = (etiqueta: string, valor: number, y: number, destacado = false) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(destacado ? 10 : 8.5)
    doc.text(`${etiqueta}: $`, 172, y, { align: 'right' })
    doc.text(importe(valor), 198, y, { align: 'right' })
  }

  if (letra === 'A') {
    const ivaDe = (id: number) => cbte.alicuotas?.find((a) => a.Id === id)?.Importe ?? 0
    let y = 227.5
    renglon('Importe Neto Gravado', cbte.neto, y)
    for (const id of ORDEN_ALICUOTAS) {
      y += 3.7
      renglon(`IVA ${TASA[id]}`, ivaDe(id), y)
    }
    y += 3.7
    renglon('Importe Otros Tributos', 0, y)
    renglon('Importe Total', cbte.total, y + 5, true)
    return
  }

  renglon('Subtotal', cbte.total, 234)
  renglon('Importe Otros Tributos', 0, 241)
  renglon('Importe Total', cbte.total, 250, true)

  if (letra === 'B') {
    // Ley 27.743: el comprobante al consumidor final informa el IVA que contiene el precio
    doc.setDrawColor(120)
    doc.rect(13, 227, 92, 19)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.text('Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)', 15, 232)
    doc.setFontSize(8)
    campo(doc, 'IVA Contenido: $', importe(cbte.iva), 15, 238, 88)
    campo(doc, 'Otros Impuestos Nacionales Indirectos: $', importe(0), 15, 243.5, 88)
    doc.setDrawColor(0)
  }
}

async function dibujarPie(doc: jsPDF, emisor: EmisorPdf, cbte: ComprobantePdf) {
  // Código QR de ARCA (RG 4291): URL con los datos del comprobante en JSON codificado en base64
  const identificado = cbte.docTipo && cbte.docTipo !== 99 && cbte.docNro
  const datos = {
    ver: 1,
    fecha: cbte.fecha,
    cuit: Number(emisor.cuit),
    ptoVta: cbte.puntoVenta,
    tipoCmp: cbte.tipo,
    nroCmp: cbte.numero,
    importe: Number(cbte.total.toFixed(2)),
    moneda: 'PES',
    ctz: 1,
    ...(identificado ? { tipoDocRec: cbte.docTipo, nroDocRec: Number(cbte.docNro) } : {}),
    tipoCodAut: 'E',
    codAut: Number(cbte.cae),
  }
  const url = `https://www.afip.gob.ar/fe/qr/?p=${btoa(JSON.stringify(datos))}`
  const qr = await QRCode.toDataURL(url, { margin: 0, width: 320, errorCorrectionLevel: 'M' })
  doc.addImage(qr, 'PNG', MARGEN, 265, 27, 27)

  doc.setTextColor(0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Comprobante Autorizado', 42, 274)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.text('Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación', 42, 279)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(`CAE N°: ${cbte.cae}`, 198, 274, { align: 'right' })
  doc.text(`Fecha de Vto. de CAE: ${fechaAR(cbte.caeVence)}`, 198, 280, { align: 'right' })
}

function dibujarMarcaDePrueba(doc: jsPDF) {
  const d = doc as any
  d.saveGraphicsState()
  d.setGState(new d.GState({ opacity: 0.16 }))
  doc.setTextColor(200, 0, 0)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(46)
  doc.text('SIN VALIDEZ FISCAL', 38, 205, { angle: 35 })
  doc.setFontSize(22)
  doc.text('COMPROBANTE DE PRUEBA', 60, 214, { angle: 35 })
  d.restoreGraphicsState()
  doc.setTextColor(0)
}

// ─── Armado ──────────────────────────────────────────────────────────────────

export async function crearComprobantePdf(emisor: EmisorPdf, cbte: ComprobantePdf): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const letra = letraDe(cbte.tipo)
  const columnas = columnasDe(letra)
  const anchoDescripcion = letra === 'A' ? 50 : 68
  const logo = emisor.logo ?? null

  const nuevaPagina = () => {
    dibujarEncabezado(doc, emisor, cbte, logo)
    dibujarTitulosDetalle(doc, columnas)
    if (cbte.prueba) dibujarMarcaDePrueba(doc)
  }
  nuevaPagina()

  let y = 107
  doc.setFontSize(7.5)
  for (const fila of filasDe(letra, cbte.items ?? [], cbte.total)) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    const descripcion: string[] = doc.splitTextToSize(fila[1], anchoDescripcion).slice(0, 2)
    const alto = 4.2 * descripcion.length + 1.3
    if (y + alto > FIN_DETALLE) {
      doc.addPage()
      nuevaPagina()
      y = 107
    }
    fila.forEach((valor, i) => {
      doc.setFontSize(i === 0 ? 6.3 : 7.5) // el código va más chico para no pisar la descripción
      if (i === 1) doc.text(descripcion, columnas[1].x, y)
      else doc.text(valor, columnas[i].x, y, { align: columnas[i].alinear })
    })
    y += alto
  }

  dibujarTotales(doc, cbte)
  await dibujarPie(doc, emisor, cbte)

  const paginas = doc.getNumberOfPages()
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(0)
    doc.text(`Pág. ${p}/${paginas}`, 105, 294, { align: 'center' })
  }
  return doc
}

// ─── Desde la app ────────────────────────────────────────────────────────────

export function cargarImagen(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

export function nombreArchivoComprobante(c: FiscalComprobante) {
  const nombre = nombreCorto(c.tipo_cbte).replace(/ /g, '-')
  return `${nombre}-${numeroComprobante(c.punto_venta, c.numero)}.pdf`
}

// Descarga el PDF de un comprobante emitido. asociado = factura original de una nota.
export async function descargarComprobante(
  comprobante: FiscalComprobante,
  config: FiscalConfig,
  opciones: {
    nombreFantasia?: string | null
    logoUrl?: string | null
    asociado?: FiscalComprobante | null
    condicionVenta?: string
  } = {},
) {
  const emisor: EmisorPdf = {
    razonSocial: config.razon_social || '',
    nombreFantasia: opciones.nombreFantasia,
    cuit: config.cuit || '',
    condicionIva: config.condicion_iva || '',
    domicilioComercial: config.domicilio_comercial,
    ingresosBrutos: config.ingresos_brutos,
    inicioActividades: config.inicio_actividades,
    logo: opciones.logoUrl ? await cargarImagen(opciones.logoUrl) : null,
  }
  const a = opciones.asociado
  const doc = await crearComprobantePdf(emisor, {
    tipo: comprobante.tipo_cbte,
    puntoVenta: comprobante.punto_venta,
    numero: comprobante.numero,
    fecha: comprobante.fecha_emision,
    cae: comprobante.cae || '',
    caeVence: comprobante.cae_vence || '',
    docTipo: comprobante.doc_tipo ?? (comprobante.cuit_receptor ? 80 : 99),
    docNro: comprobante.doc_nro ?? comprobante.cuit_receptor,
    razonSocialReceptor: comprobante.razon_social_receptor,
    condicionIvaReceptor: comprobante.condicion_iva_receptor,
    condicionVenta: opciones.condicionVenta,
    items: comprobante.items,
    alicuotas: comprobante.alicuotas,
    neto: comprobante.importe_neto ?? 0,
    iva: comprobante.importe_iva ?? 0,
    total: comprobante.importe_total ?? 0,
    asociado: a ? { tipo: a.tipo_cbte, puntoVenta: a.punto_venta, numero: a.numero, fecha: a.fecha_emision } : null,
    prueba: comprobante.ambiente === 'dev',
  })
  doc.save(nombreArchivoComprobante(comprobante))
}

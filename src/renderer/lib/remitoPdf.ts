// PDF de remitos: original y duplicado, con el mismo formato que los comprobantes de ARCA.
// El remito X lleva la leyenda "Documento no válido como factura"; el R, su CAI y vencimiento.

import jsPDF from 'jspdf'
import type { FiscalConfig } from '@/store/fiscal'
import { CONDICION_EMISOR, DOCUMENTO, campo, cargarImagen, cuitConGuiones, fechaAR } from './facturaPdf'
import { MOTIVOS_REMITO, numeroRemito, type Remito } from './remitos'

export interface EmisorRemito {
  nombre: string                       // nombre de fantasía (el de la organización)
  razonSocial?: string | null
  cuit?: string | null
  condicionIva?: string | null
  domicilio?: string | null
  ingresosBrutos?: string | null
  inicioActividades?: string | null
  logo?: HTMLImageElement | string | null
}

export interface DatosRemito {
  remito: Remito
  sucursalDestino?: string | null      // nombre de la sucursal destino (traslados)
}

const MARGEN = 10
const ANCHO = 190
const FIN_DETALLE = 222

function dibujarEncabezado(doc: jsPDF, emisor: EmisorRemito, { remito, sucursalDestino }: DatosRemito, copia: string) {
  doc.setDrawColor(0)
  doc.setLineWidth(0.3)
  doc.setTextColor(0)

  doc.rect(MARGEN, 10, ANCHO, 8)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(copia, 105, 15.5, { align: 'center' })

  // Recuadro principal con la letra al medio
  doc.rect(MARGEN, 18, ANCHO, 48)
  doc.line(105, 34, 105, 66)
  doc.setFillColor(255, 255, 255)
  doc.rect(97, 18, 16, 16, 'FD')
  doc.setFontSize(24)
  doc.text(remito.tipo, 105, 28.5, { align: 'center' })
  if (remito.tipo === 'R') {
    doc.setFontSize(6.5)
    doc.text('COD. 091', 105, 32.3, { align: 'center' })
  }

  // Emisor (izquierda)
  let yNombre = 30
  if (emisor.logo) {
    try {
      const logo = emisor.logo
      const props = typeof logo === 'string' ? doc.getImageProperties(logo) : { width: logo.width, height: logo.height }
      const escala = Math.min(40 / props.width, 13 / props.height)
      doc.addImage(logo, 'PNG', 13, 20, props.width * escala, props.height * escala)
      yNombre = 20 + props.height * escala + 5
    } catch {
      // Si el logo no se puede dibujar, el remito sale sin él
    }
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(yNombre > 30 ? 11 : 14)
  doc.text(doc.splitTextToSize(emisor.nombre, 80).slice(0, 2), 13, yNombre)
  doc.setFontSize(8)
  if (emisor.razonSocial) campo(doc, 'Razón Social:', emisor.razonSocial, 13, 51, 88)
  campo(doc, 'Domicilio:', emisor.domicilio || '', 13, 56, 88)
  if (emisor.condicionIva) {
    campo(doc, 'Condición frente al IVA:', CONDICION_EMISOR[emisor.condicionIva] ?? emisor.condicionIva, 13, 61, 88)
  }

  // Remito (derecha)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('REMITO', 116, 27)
  doc.setFontSize(9)
  doc.text(`Punto de Venta: ${String(remito.punto_venta).padStart(5, '0')}      Comp. Nro: ${String(remito.numero).padStart(8, '0')}`, 116, 36)
  doc.text(`Fecha de Emisión: ${fechaAR(remito.fecha)}`, 116, 42)
  doc.setFontSize(8)
  if (emisor.cuit) campo(doc, 'CUIT:', cuitConGuiones(emisor.cuit), 116, 51, 82)
  if (emisor.ingresosBrutos) campo(doc, 'Ingresos Brutos:', emisor.ingresosBrutos, 116, 56, 82)
  if (emisor.inicioActividades) campo(doc, 'Fecha de Inicio de Actividades:', fechaAR(emisor.inicioActividades), 116, 61, 82)
  // Los remitos (X y R) llevan esta leyenda: no son factura
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text('DOCUMENTO NO VÁLIDO COMO FACTURA', 116, 46.5)

  // Destinatario y entrega
  doc.rect(MARGEN, 68, ANCHO, 30)
  doc.setFontSize(8)
  const documento = remito.destinatario_doc_nro
    ? `${DOCUMENTO[remito.destinatario_doc_tipo ?? 96] ?? 'Doc.'}: ${remito.destinatario_doc_tipo === 80 ? cuitConGuiones(remito.destinatario_doc_nro) : remito.destinatario_doc_nro}`
    : ''
  campo(doc, 'Destinatario:', remito.destinatario_nombre || (sucursalDestino ? `Sucursal ${sucursalDestino}` : ''), 13, 74, 120)
  if (documento) {
    doc.setFont('helvetica', 'bold')
    doc.text(documento, 140, 74)
  }
  campo(doc, 'Domicilio de entrega:', remito.domicilio_entrega || '', 13, 80, 185)
  campo(doc, 'Motivo:', MOTIVOS_REMITO[remito.motivo], 13, 86, 90)
  if (remito.sale_id) campo(doc, 'Venta:', remito.sale_id.slice(0, 8), 105, 86, 93)
  if (sucursalDestino) campo(doc, 'Sucursal destino:', sucursalDestino, 105, 86, 93)
  campo(doc, 'Transportista:', remito.transportista || '', 13, 92, 185)

  // Títulos del detalle
  doc.setFillColor(225, 225, 225)
  doc.rect(MARGEN, 101, ANCHO, 7, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text('Código', 12, 105.6)
  doc.text('Descripción', 42, 105.6)
  doc.text('Cantidad', 172, 105.6, { align: 'right' })
  doc.text('U. Medida', 176, 105.6)

  if (remito.estado === 'anulado') {
    const d = doc as any
    d.saveGraphicsState()
    d.setGState(new d.GState({ opacity: 0.18 }))
    doc.setTextColor(200, 0, 0)
    doc.setFontSize(80)
    doc.text('ANULADO', 45, 200, { angle: 35 })
    d.restoreGraphicsState()
    doc.setTextColor(0)
  }
}

function dibujarPie(doc: jsPDF, remito: Remito) {
  // Observaciones
  doc.setDrawColor(0)
  doc.rect(MARGEN, 225, ANCHO, 14)
  doc.setFontSize(8)
  campo(doc, 'Observaciones:', '', 13, 230, 185)
  doc.setFont('helvetica', 'normal')
  doc.text(doc.splitTextToSize(remito.observaciones || '', 180).slice(0, 2), 13, 234.5)

  // Conformidad de quien recibe
  doc.rect(MARGEN, 241, ANCHO, 36)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.text('Recibí conforme la mercadería detallada', 13, 247)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const lineas = [
    { etiqueta: 'Firma', x: 16 },
    { etiqueta: 'Aclaración', x: 64 },
    { etiqueta: 'DNI', x: 112 },
    { etiqueta: 'Fecha', x: 160 },
  ]
  for (const l of lineas) {
    doc.line(l.x, 268, l.x + 36, 268)
    doc.text(l.etiqueta, l.x + 18, 272.5, { align: 'center' })
  }

  // Validez
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  if (remito.tipo === 'R' && remito.cai) {
    doc.text(`CAI N°: ${remito.cai}`, 13, 284)
    doc.text(`Fecha de Vto. del CAI: ${fechaAR(remito.cai_vence)}`, 198, 284, { align: 'right' })
  } else {
    doc.text('DOCUMENTO NO VÁLIDO COMO FACTURA', 105, 284, { align: 'center' })
  }
}

// Una copia completa (original o duplicado); si el detalle no entra en una hoja, sigue en otra
function dibujarCopia(doc: jsPDF, emisor: EmisorRemito, datos: DatosRemito, copia: string): number {
  const inicio = doc.getNumberOfPages()
  dibujarEncabezado(doc, emisor, datos, copia)
  let y = 113
  for (const item of datos.remito.items) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    const descripcion: string[] = doc.splitTextToSize(item.descripcion, 118).slice(0, 2)
    const alto = 4.3 * descripcion.length + 1.5
    if (y + alto > FIN_DETALLE) {
      doc.addPage()
      dibujarEncabezado(doc, emisor, datos, copia)
      y = 113
    }
    doc.setFontSize(7)
    doc.text((item.codigo || '-').slice(0, 14), 12, y)
    doc.setFontSize(8)
    doc.text(descripcion, 42, y)
    doc.text(new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 }).format(item.cantidad), 172, y, { align: 'right' })
    doc.text('unidades', 176, y)
    y += alto
  }
  dibujarPie(doc, datos.remito)
  return inicio
}

export function crearRemitoPdf(emisor: EmisorRemito, datos: DatosRemito): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const inicioOriginal = dibujarCopia(doc, emisor, datos, 'ORIGINAL')
  doc.addPage()
  const inicioDuplicado = dibujarCopia(doc, emisor, datos, 'DUPLICADO')

  // Numeración de páginas dentro de cada copia
  const total = doc.getNumberOfPages()
  const porCopia = inicioDuplicado - inicioOriginal
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(0)
    const pagina = p < inicioDuplicado ? p - inicioOriginal + 1 : p - inicioDuplicado + 1
    doc.text(`Pág. ${pagina}/${porCopia}`, 105, 293, { align: 'center' })
  }
  return doc
}

// Descarga el PDF de un remito con los datos del negocio disponibles
export async function descargarRemito(
  remito: Remito,
  opciones: {
    nombre: string
    fiscal?: FiscalConfig | null
    domicilioSucursal?: string | null
    sucursalDestino?: string | null
    logoUrl?: string | null
  },
) {
  const fiscal = opciones.fiscal?.fiscal_enabled ? opciones.fiscal : null
  const emisor: EmisorRemito = {
    nombre: opciones.nombre,
    razonSocial: fiscal?.razon_social,
    cuit: fiscal?.cuit,
    condicionIva: fiscal?.condicion_iva,
    domicilio: fiscal?.domicilio_comercial || opciones.domicilioSucursal,
    ingresosBrutos: fiscal?.ingresos_brutos,
    inicioActividades: fiscal?.inicio_actividades,
    logo: opciones.logoUrl ? await cargarImagen(opciones.logoUrl) : null,
  }
  const doc = crearRemitoPdf(emisor, { remito, sucursalDestino: opciones.sucursalDestino })
  doc.save(`Remito-${numeroRemito(remito).replace(' ', '-')}.pdf`)
}

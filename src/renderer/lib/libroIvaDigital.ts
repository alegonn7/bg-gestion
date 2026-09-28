// Libro IVA Digital de ARCA (RG 4597): archivos de ventas del mes para importar en Portal IVA.
//   LIBRO_IVA_DIGITAL_VENTAS_CBTE: un registro de 266 posiciones por comprobante.
//   LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS: un registro de 62 posiciones por alícuota de cada comprobante.
// Números con ceros a la izquierda, textos con espacios a la derecha, importes en centavos
// (13 enteros + 2 decimales), codificación Windows-1252 y fin de línea CRLF.
// Diseño oficial: arca.gob.ar/iva/documentos/libro-iva-digital-diseno-registros.pdf

export interface ComprobanteLibro {
  fecha_emision: string        // YYYY-MM-DD
  tipo_cbte: number
  punto_venta: number
  numero: number
  doc_tipo: number | null      // 80 = CUIT, 96 = DNI, 99/null = consumidor final sin identificar
  doc_nro: string | null
  cuit_receptor: string | null
  razon_social_receptor: string | null
  importe_total: number | null
  alicuotas: { Id: number; BaseImp: number; Importe: number }[] | null
}

export interface ArchivosLibroIva {
  comprobantes: Uint8Array<ArrayBuffer>     // LIBRO_IVA_DIGITAL_VENTAS_CBTE.txt
  alicuotas: Uint8Array<ArrayBuffer>        // LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS.txt
  cantidad: number             // comprobantes incluidos
  omitidos: number             // comprobantes C o sin detalle de IVA: no van al libro
}

// Facturas, notas de débito y notas de crédito A y B: las C no discriminan IVA
const TIPOS_DEL_LIBRO = [1, 2, 3, 6, 7, 8]
// "Exento/0%" en la app: se informa como operación exenta
const ALICUOTA_EXENTA = 3

const centavos = (valor: number | null | undefined) => Math.round((valor ?? 0) * 100)

function numerico(valor: number | string, ancho: number, campo: string): string {
  const texto = String(valor)
  if (!/^\d+$/.test(texto)) throw new Error(`${campo}: tiene que ser un número`)
  if (texto.length > ancho) throw new Error(`${campo}: supera las ${ancho} posiciones`)
  return texto.padStart(ancho, '0')
}

function importe(cents: number, campo: string): string {
  if (!Number.isSafeInteger(cents)) throw new Error(`${campo}: importe inválido`)
  const digitos = Math.abs(cents).toString()
  const ancho = cents < 0 ? 14 : 15
  if (digitos.length > ancho) throw new Error(`${campo}: supera las 15 posiciones`)
  return cents < 0 ? `-${digitos.padStart(ancho, '0')}` : digitos.padStart(ancho, '0')
}

// Deja solo caracteres de Windows-1252 que no den problemas: comillas y guiones tipográficos
// pasan a sus versiones simples, y lo que no existe en Latin-1 pierde el acento o se vuelve espacio
function paraArca(valor: string): string {
  return valor
    .toLocaleUpperCase('es-AR')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, '-')
    .split('')
    .map(c => {
      const codigo = c.charCodeAt(0)
      if ((codigo >= 0x20 && codigo <= 0x7e) || (codigo >= 0xa0 && codigo <= 0xff)) return c
      const base = c.normalize('NFD').replace(/[̀-ͯ]/g, '')
      return base.length === 1 && base.charCodeAt(0) >= 0x20 && base.charCodeAt(0) <= 0x7e ? base : ' '
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

function texto(valor: string, ancho: number): string {
  return paraArca(valor).slice(0, ancho).padEnd(ancho, ' ')
}

function registro(partes: string[], largo: number, campo: string): string {
  const linea = partes.join('')
  if (linea.length !== largo) throw new Error(`${campo}: mide ${linea.length} y ARCA pide ${largo}`)
  return linea
}

// Latin-1 y Windows-1252 coinciden en todo lo que deja paraArca: cada carácter es un byte
function bytes(lineas: string[]): Uint8Array<ArrayBuffer> {
  const contenido = lineas.length ? `${lineas.join('\r\n')}\r\n` : ''
  const salida = new Uint8Array(contenido.length)
  for (let i = 0; i < contenido.length; i++) salida[i] = contenido.charCodeAt(i) & 0xff
  return salida
}

function comprador(c: ComprobanteLibro): { codigo: number; numero: string; nombre: string } {
  const digitos = (valor: string | null) => (valor || '').replace(/\D/g, '')
  const cuit = digitos(c.cuit_receptor) || digitos(c.doc_nro)
  if (c.doc_tipo === 80 && cuit) {
    return { codigo: 80, numero: cuit, nombre: c.razon_social_receptor || 'SIN NOMBRE' }
  }
  if (c.doc_tipo && c.doc_tipo !== 99 && digitos(c.doc_nro)) {
    return { codigo: c.doc_tipo, numero: digitos(c.doc_nro), nombre: c.razon_social_receptor || 'CONSUMIDOR FINAL' }
  }
  return { codigo: 99, numero: '0', nombre: 'CONSUMIDOR FINAL' }
}

export function generarLibroIvaVentas(lista: ComprobanteLibro[]): ArchivosLibroIva {
  const ordenados = [...lista].sort((a, b) =>
    a.fecha_emision.localeCompare(b.fecha_emision) || a.tipo_cbte - b.tipo_cbte ||
    a.punto_venta - b.punto_venta || a.numero - b.numero)

  const lineasCbte: string[] = []
  const lineasAlicuotas: string[] = []
  let omitidos = 0

  for (const c of ordenados) {
    if (!TIPOS_DEL_LIBRO.includes(c.tipo_cbte) || !c.alicuotas?.length) {
      omitidos++
      continue
    }
    const alicuotas = c.alicuotas.map(a => ({ codigo: Number(a.Id), neto: centavos(a.BaseImp), iva: centavos(a.Importe) }))
    // Lo exento va en su propio campo; las alícuotas son solo las gravadas. Si todo es exento,
    // ARCA pide igual un registro al 0% con importes en cero y el código de operación "E"
    const gravadas = alicuotas.filter(a => a.codigo !== ALICUOTA_EXENTA)
    const exento = alicuotas.filter(a => a.codigo === ALICUOTA_EXENTA).reduce((s, a) => s + a.neto, 0)
    const detalle = gravadas.length ? gravadas : [{ codigo: ALICUOTA_EXENTA, neto: 0, iva: 0 }]

    const total = centavos(c.importe_total)
    // ARCA aprobó el comprobante con total = neto + IVA, así que la diferencia es siempre cero
    const noGravado = total - exento - detalle.reduce((s, a) => s + a.neto + a.iva, 0)
    if (noGravado !== 0) console.warn(`Libro IVA: ${c.tipo_cbte}-${c.punto_venta}-${c.numero} difiere en ${noGravado} centavos`)

    const quien = comprador(c)
    const tipo = numerico(c.tipo_cbte, 3, 'Tipo de comprobante')
    const puntoVenta = numerico(c.punto_venta, 5, 'Punto de venta')
    const numero = numerico(c.numero, 20, 'Número de comprobante')

    lineasCbte.push(registro([
      numerico(c.fecha_emision.replace(/-/g, ''), 8, 'Fecha'),
      tipo,
      puntoVenta,
      numero,
      numero,                                             // número hasta: el mismo
      numerico(quien.codigo, 2, 'Tipo de documento'),
      numerico(quien.numero, 20, 'Documento del comprador'),
      texto(quien.nombre, 30),
      importe(total, 'Importe total'),
      importe(noGravado, 'Conceptos no gravados'),
      importe(0, 'Percepción a no categorizados'),
      importe(exento, 'Operaciones exentas'),
      importe(0, 'Percepciones nacionales'),
      importe(0, 'Percepciones de Ingresos Brutos'),
      importe(0, 'Percepciones municipales'),
      importe(0, 'Impuestos internos'),
      'PES',
      '0001000000',                                       // tipo de cambio 1,000000
      numerico(detalle.length, 1, 'Cantidad de alícuotas'),
      gravadas.length ? '0' : 'E',                        // código de operación
      importe(0, 'Otros tributos'),
      '00000000',                                         // fecha de vencimiento: solo servicios públicos
    ], 266, 'Comprobante'))

    for (const a of detalle) {
      lineasAlicuotas.push(registro([
        tipo,
        puntoVenta,
        numero,
        importe(a.neto, 'Neto gravado'),
        numerico(a.codigo, 4, 'Alícuota'),
        importe(a.iva, 'IVA'),
      ], 62, 'Alícuota'))
    }
  }

  return {
    comprobantes: bytes(lineasCbte),
    alicuotas: bytes(lineasAlicuotas),
    cantidad: lineasCbte.length,
    omitidos,
  }
}

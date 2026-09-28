import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

// 'dev' = modo prueba (homologación de ARCA, sin validez fiscal) · 'prod' = facturas reales
export type Ambiente = 'dev' | 'prod'

export interface FiscalConfig {
  fiscal_enabled: boolean
  cuit: string | null
  razon_social: string | null
  condicion_iva: string | null
  punto_venta: number
  actividad_afip: number | null
  domicilio_comercial: string | null
  ingresos_brutos: string | null
  inicio_actividades: string | null
  ambiente: Ambiente
  conectado: boolean
}

// 'habilitar' solo en producción: activa en ARCA el servicio para crear certificados.
// 'manual': el cliente hace los trámites en la página de ARCA con el paso a paso de la app
export type PasoAlta = 'habilitar' | 'certificado' | 'autorizacion' | 'puntos_venta' | 'punto_venta' | 'manual' | 'listo'

// Alta en ARCA con Afip SDK: se avanza paso a paso con la clave fiscal del cliente
export interface AltaFiscal {
  paso: PasoAlta
  estado: 'en_curso' | 'error' | 'manual' | 'listo'
  error: string | null
  punto_venta: number | null
  cert_alias?: string | null   // nombre del certificado en ARCA (el alta manual lo muestra)
}

export interface AltaManualParams {
  cuit: string
  razonSocial: string
  condicionIva: string
  nuevo?: boolean              // descarta el pedido anterior y genera otro
}

export interface InvoiceItem {
  codigo: string
  descripcion: string
  cantidad: number
  precioUnitario: number    // SIN IVA en comprobantes A; CON IVA en B y C
  importeBonificacion?: number
  codigoAlicuotaIVA: number
  importeIVA: number        // IVA por unidad (ya bonificado); solo en comprobantes A
}

export interface FiscalComprobante {
  id: string
  ambiente: Ambiente
  sale_id: string | null
  original_comprobante_id: string | null
  tipo_cbte: number
  punto_venta: number
  numero: number
  fecha_emision: string
  doc_tipo: number | null   // 80 = CUIT, 96 = DNI, 99 = consumidor final sin identificar
  doc_nro: string | null
  cuit_receptor: string | null
  razon_social_receptor: string | null
  condicion_iva_receptor: number | null
  items: InvoiceItem[] | null
  alicuotas: { Id: number; BaseImp: number; Importe: number }[] | null
  importe_total: number | null
  importe_neto: number | null
  importe_iva: number | null
  cae: string | null
  cae_vence: string | null
  resultado: string
  created_at: string
  created_by_name: string | null   // quién lo emitió
}

export type TipoComprobante = 1 | 2 | 3 | 6 | 7 | 8 | 11 | 12 | 13

// Columnas que usan las pantallas y los PDF: no se trae lo enviado/recibido de ARCA (raw_*)
const COLUMNAS_COMPROBANTE = 'id, ambiente, sale_id, original_comprobante_id, tipo_cbte, punto_venta, numero, fecha_emision, doc_tipo, doc_nro, cuit_receptor, razon_social_receptor, condicion_iva_receptor, items, alicuotas, importe_total, importe_neto, importe_iva, cae, cae_vence, resultado, created_at, created_by_name'

const FACTURAS = [1, 6, 11]
const NOTAS_CREDITO = [3, 8, 13]
const aprobado = (c: FiscalComprobante) => c.resultado === 'A' || c.resultado === 'O'

export interface EmitInvoiceParams {
  saleId?: string
  tipoComprobante: TipoComprobante
  docTipo?: number          // 80 = CUIT, 96 = DNI; sin documento = consumidor final anónimo
  docNro?: string
  razonSocialReceptor?: string
  condicionIVAReceptor: number
  items: InvoiceItem[]
}

export interface EmitCreditNoteParams {
  originalComprobante: FiscalComprobante
  saleId?: string
  items: InvoiceItem[]
}

export interface EmitDebitNoteParams {
  originalComprobante: FiscalComprobante
  saleId?: string
  concepto: string
  importe: number               // importe final, con IVA incluido
  codigoAlicuotaIVA?: number    // 5 = 21% por defecto; no aplica a comprobantes C
}

export interface IniciarAltaParams {
  cuit: string
  usuario?: string          // CUIT/CUIL con el que se entra a ARCA, si no es el del negocio
  clave: string             // clave fiscal: viaja al servidor en cada paso y no se guarda
  razonSocial: string
  condicionIva: string
  puntoVenta?: number | null
}

export interface SaveConfigParams {
  razonSocial: string
  condicionIva: string
  actividadAfip: number | null
  domicilioComercial: string
  ingresosBrutos: string
  inicioActividades: string | null
}

interface FiscalState {
  config: FiscalConfig | null
  alta: AltaFiscal | null
  ambienteNuevo: Ambiente
  // Sin automatizaciones disponibles: el alta y el CAI se hacen a mano en la página de ARCA
  sinAutomatizaciones: boolean
  comprobantes: FiscalComprobante[]
  isLoading: boolean
  error: string | null

  fetchConfig: () => Promise<void>
  iniciarAlta: (params: IniciarAltaParams) => Promise<void>
  avanzarAlta: (clave: string) => Promise<void>
  reintentarAlta: (clave: string) => Promise<void>
  cancelarAlta: () => Promise<void>
  // Alta manual: pedido de certificado para subir en ARCA, y verificación final
  pedirCertificadoManual: (params: AltaManualParams) => Promise<{ csr: string; alias: string }>
  verificarAltaManual: (params: { certificadoBase64: string; puntoVenta: number }) => Promise<void>
  usarCuitPrueba: (condicionIva: string) => Promise<void>
  saveConfig: (params: SaveConfigParams) => Promise<void>
  deleteConfig: () => Promise<void>
  emitDebitNote: (params: EmitDebitNoteParams) => Promise<{
    cae: string
    caeVence: string
    numero: number
    resultado: string
  }>
  emitInvoice: (params: EmitInvoiceParams) => Promise<{
    cae: string
    caeVence: string
    numero: number
    resultado: string
  }>
  emitCreditNote: (params: EmitCreditNoteParams) => Promise<{
    cae: string
    caeVence: string
    numero: number
    resultado: string
  }>
  fetchComprobantes: (limit?: number) => Promise<void>
  // Comprobantes de las ventas que se están mostrando en el Historial de Ventas
  comprobantesVentas: FiscalComprobante[]
  ventasConsultadas: string[]
  fetchComprobantesDeVentas: (saleIds: string[]) => Promise<void>
  getFacturaDeVenta: (saleId: string) => FiscalComprobante | undefined
  getNotasDeFactura: (facturaId: string) => FiscalComprobante[]
  buscarComprobantes: (filtros: FiltrosComprobantes) => Promise<{ comprobantes: FiscalComprobante[]; total: number }>
}

export interface FiltrosComprobantes {
  texto: string                 // código de venta, DNI/CUIT, nombre del cliente o número
  tipo: '' | 'facturas' | 'nc' | 'nd'
  desde: string                 // YYYY-MM-DD
  hasta: string
  pagina: number
}

export { COLUMNAS_COMPROBANTE }

export const COMPROBANTES_POR_PAGINA = 20

const TIPOS_FILTRO = { facturas: FACTURAS, nc: NOTAS_CREDITO, nd: [2, 7, 12] }

// Lo que queda de una factura: su total, más las notas de débito, menos las notas de crédito
export function saldoDeFactura(factura: FiscalComprobante, notas: FiscalComprobante[]): number {
  return notas.reduce((saldo, n) => {
    if (NOTAS_CREDITO.includes(n.tipo_cbte)) return saldo - (n.importe_total ?? 0)
    if (TIPOS_FILTRO.nd.includes(n.tipo_cbte)) return saldo + (n.importe_total ?? 0)
    return saldo
  }, factura.importe_total ?? 0)
}

// ¿La venta tiene una factura que todavía no se anuló con notas de crédito? Se consulta a la base
// porque la pantalla puede no tener cargados los comprobantes de esa venta
export async function ventaTieneFacturaVigente(saleId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('fiscal_comprobantes')
    .select(COLUMNAS_COMPROBANTE)
    .eq('sale_id', saleId)
    .order('created_at', { ascending: false })
  if (error) throw error
  const comprobantes = (data || []) as FiscalComprobante[]
  const factura = comprobantes.find(c => FACTURAS.includes(c.tipo_cbte) && aprobado(c))
  if (!factura) return false
  const notas = comprobantes.filter(c => c.original_comprobante_id === factura.id && aprobado(c))
  return saldoDeFactura(factura, notas) > 0.05
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

// Error que devolvió la función del servidor, con lo que mandó además del mensaje
// (por ejemplo `codigo: 'sin_automatizaciones'` o el `tramite` a revisar en el alta manual)
export class ErrorDelServidor extends Error {
  constructor(mensaje: string, readonly datos: Record<string, any>) {
    super(mensaje)
  }
}

export const esSinAutomatizaciones = (err: unknown) =>
  err instanceof ErrorDelServidor && err.datos.codigo === 'sin_automatizaciones'

export async function callEdgeFunction(fnName: string, body: object) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Tu sesión venció. Volvé a iniciar sesión.')

  let res: Response
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('No hay conexión. Revisá tu internet y probá de nuevo.')
  }

  // Mensajes para el usuario: el detalle técnico queda en la consola
  let data: any
  try {
    data = await res.json()
  } catch {
    console.error(`${fnName}: respuesta inválida (HTTP ${res.status})`)
    throw new Error('No se pudo completar la operación. Probá de nuevo en unos minutos.')
  }
  if (!res.ok || !data.ok) {
    throw new ErrorDelServidor(data.error || 'No se pudo completar la operación. Probá de nuevo en unos minutos.', data)
  }
  return data
}

export const useFiscalStore = create<FiscalState>((set, get) => ({
  config: null,
  alta: null,
  ambienteNuevo: 'dev',
  sinAutomatizaciones: false,
  comprobantes: [],
  comprobantesVentas: [],
  ventasConsultadas: [],
  isLoading: false,
  error: null,

  fetchConfig: async () => {
    set({ isLoading: true, error: null })
    try {
      // Una sola consulta a la base: sin pasar por las funciones del servidor, que son más lentas
      const { data, error } = await supabase.rpc('fiscal_config')
      if (error) throw error
      set({
        config: data?.config ?? null,
        alta: data?.alta ?? null,
        ambienteNuevo: data?.ambiente_nuevo === 'prod' ? 'prod' : 'dev',
        sinAutomatizaciones: !!data?.sin_automatizaciones,
        isLoading: false,
      })
    } catch (err: any) {
      console.error('Error leyendo la configuración fiscal:', err)
      set({ error: 'No se pudo cargar la configuración de facturación', isLoading: false })
    }
  },

  iniciarAlta: async (params) => {
    const data = await callEdgeFunction('fiscal-setup', { action: 'alta_iniciar', ...params })
    set({ alta: data.alta })
  },

  avanzarAlta: async (clave) => {
    const data = await callEdgeFunction('fiscal-setup', { action: 'alta_avanzar', clave })
    set({ alta: data.alta })
    if (data.alta?.estado === 'listo') await get().fetchConfig()
  },

  reintentarAlta: async (clave) => {
    const data = await callEdgeFunction('fiscal-setup', { action: 'alta_reintentar', clave })
    set({ alta: data.alta })
  },

  cancelarAlta: async () => {
    await callEdgeFunction('fiscal-setup', { action: 'alta_cancelar' })
    set({ alta: null })
  },

  pedirCertificadoManual: async (params) => {
    const data = await callEdgeFunction('fiscal-setup', { action: 'manual_pedido', ...params })
    set({ alta: data.alta })
    return { csr: data.csr, alias: data.alta?.cert_alias ?? '' }
  },

  verificarAltaManual: async ({ certificadoBase64, puntoVenta }) => {
    const data = await callEdgeFunction('fiscal-setup', { action: 'manual_verificar', certificado: certificadoBase64, puntoVenta })
    set({ alta: data.alta })
    await get().fetchConfig()
  },

  usarCuitPrueba: async (condicionIva) => {
    await callEdgeFunction('fiscal-setup', { action: 'usar_cuit_prueba', condicionIva })
    await get().fetchConfig()
  },

  saveConfig: async (params) => {
    set({ isLoading: true, error: null })
    try {
      await callEdgeFunction('fiscal-setup', { action: 'save_config', ...params })
      await get().fetchConfig()
    } catch (err: any) {
      set({ error: err.message, isLoading: false })
      throw err
    }
  },

  deleteConfig: async () => {
    set({ isLoading: true, error: null })
    try {
      await callEdgeFunction('fiscal-setup', { action: 'delete_config' })
      await get().fetchConfig()
    } catch (err: any) {
      set({ error: err.message, isLoading: false })
      throw err
    }
  },

  emitDebitNote: async (params) => {
    const { config } = get()
    if (!config?.fiscal_enabled) throw new Error('Facturación no configurada')

    const { originalComprobante: orig } = params
    const ND_TIPO: Record<number, TipoComprobante> = { 1: 2, 6: 7, 11: 12 }
    const tipoND = ND_TIPO[orig.tipo_cbte]
    if (!tipoND) throw new Error(`No se puede hacer ND para tipo ${orig.tipo_cbte}`)

    // El importe se ingresa final (con IVA); en la A se separa neto e IVA
    const alicuota = params.codigoAlicuotaIVA ?? 5
    const esA = tipoND === 2

    // El punto de venta y la fecha los pone el servidor
    const result = await callEdgeFunction('fiscal-emit', {
      invoiceRequest: {
        tipoComprobante: tipoND,
        ...documentoDe(orig),
        razonSocialReceptor: orig.razon_social_receptor || undefined,
        condicionIVAReceptor: orig.condicion_iva_receptor ?? 5,
        items: [{
          codigo: 'ND',
          descripcion: params.concepto.slice(0, 100),
          cantidad: 1,
          precioUnitario: esA ? precioSinIva(params.importe, alicuota) : params.importe,
          codigoAlicuotaIVA: alicuota,
          importeIVA: esA ? calcularIVA(params.importe, alicuota) : 0,
        }],
        comprobantesAsociados: [{
          tipoComprobante: orig.tipo_cbte,
          puntoVenta: orig.punto_venta,
          numero: orig.numero,
          fechaEmision: orig.fecha_emision,
        }],
      },
      saleId: params.saleId || null,
      originalComprobanteId: orig.id,
    })

    await Promise.all([get().fetchComprobantes(200), get().fetchComprobantesDeVentas(get().ventasConsultadas)])
    return result
  },

  emitInvoice: async (params) => {
    const { config } = get()
    if (!config?.fiscal_enabled) throw new Error('Facturación no configurada')

    const result = await callEdgeFunction('fiscal-emit', {
      invoiceRequest: {
        tipoComprobante: params.tipoComprobante,
        docTipo: params.docTipo,
        docNro: params.docNro,
        razonSocialReceptor: params.razonSocialReceptor,
        condicionIVAReceptor: params.condicionIVAReceptor,
        items: params.items,
      },
      saleId: params.saleId,
    })

    // Así la venta deja de ofrecer "Factura" y aparece para descargar
    await Promise.all([get().fetchComprobantes(200), get().fetchComprobantesDeVentas(get().ventasConsultadas)])
    return result
  },

  emitCreditNote: async (params) => {
    const { config } = get()
    if (!config?.fiscal_enabled) throw new Error('Facturación no configurada')

    const { originalComprobante: orig } = params

    // Derivar tipo NC según el tipo original
    const NC_TIPO: Record<number, TipoComprobante> = { 1: 3, 6: 8, 11: 13 }
    const tipoNC = NC_TIPO[orig.tipo_cbte]
    if (!tipoNC) throw new Error(`No se puede hacer NC para tipo ${orig.tipo_cbte}`)

    const result = await callEdgeFunction('fiscal-emit', {
      invoiceRequest: {
        tipoComprobante: tipoNC,
        ...documentoDe(orig),
        razonSocialReceptor: orig.razon_social_receptor || undefined,
        condicionIVAReceptor: orig.condicion_iva_receptor ?? 5,
        items: params.items,
        comprobantesAsociados: [{
          tipoComprobante: orig.tipo_cbte,
          puntoVenta: orig.punto_venta,
          numero: orig.numero,
          fechaEmision: orig.fecha_emision,
        }],
      },
      saleId: params.saleId || null,
      originalComprobanteId: orig.id,
    })

    // Refrescar comprobantes
    await Promise.all([get().fetchComprobantes(200), get().fetchComprobantesDeVentas(get().ventasConsultadas)])
    return result
  },

  fetchComprobantes: async (limit = 50) => {
    try {
      const { data, error } = await supabase
        .from('fiscal_comprobantes')
        .select(COLUMNAS_COMPROBANTE)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      set({ comprobantes: data || [] })
    } catch (err: any) {
      console.error('Error fetching comprobantes:', err)
    }
  },

  fetchComprobantesDeVentas: async (saleIds) => {
    set({ ventasConsultadas: saleIds })
    if (!saleIds.length) {
      set({ comprobantesVentas: [] })
      return
    }
    const { data, error } = await supabase
      .from('fiscal_comprobantes')
      .select(COLUMNAS_COMPROBANTE)
      .in('sale_id', saleIds)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('Error fetching comprobantes de ventas:', error)
      return
    }
    set({ comprobantesVentas: data || [] })
  },

  // La factura vigente de la venta (la más reciente; la lista viene ordenada de nueva a vieja)
  getFacturaDeVenta: (saleId) => {
    return get().comprobantesVentas.find(c => c.sale_id === saleId && FACTURAS.includes(c.tipo_cbte) && aprobado(c))
  },

  // Notas de crédito y débito asociadas a una factura, de la más vieja a la más nueva
  getNotasDeFactura: (facturaId) => {
    return get().comprobantesVentas
      .filter(c => c.original_comprobante_id === facturaId && aprobado(c))
      .reverse()
  },

  buscarComprobantes: async (filtros) => {
    const desde = (filtros.pagina - 1) * COMPROBANTES_POR_PAGINA
    let query = supabase
      .from('fiscal_comprobantes')
      .select(COLUMNAS_COMPROBANTE, { count: 'exact' })
      .order('fecha_emision', { ascending: false })
      .order('created_at', { ascending: false })
      .range(desde, desde + COMPROBANTES_POR_PAGINA - 1)

    if (filtros.tipo) query = query.in('tipo_cbte', TIPOS_FILTRO[filtros.tipo])
    if (filtros.desde) query = query.gte('fecha_emision', filtros.desde)
    if (filtros.hasta) query = query.lte('fecha_emision', filtros.hasta)

    // Busca en el código de venta, el documento y el nombre del cliente, y el número del comprobante
    const texto = filtros.texto.trim().replace(/[,()%*]/g, ' ').trim()
    if (texto) {
      const digitos = texto.replace(/\D/g, '')
      query = query.or([
        `sale_ref.ilike.${texto.toLowerCase()}%`,
        `razon_social_receptor.ilike.%${texto}%`,
        ...(digitos ? [`doc_nro.ilike.%${digitos}%`, `cuit_receptor.ilike.%${digitos}%`] : []),
        ...(digitos && digitos.length <= 8 ? [`numero.eq.${Number(digitos)}`] : []),
      ].join(','))
    }

    const { data, error, count } = await query
    if (error) throw error
    return { comprobantes: (data || []) as FiscalComprobante[], total: count ?? 0 }
  },
}))

// El comprador de una nota de crédito/débito es el mismo de la factura original
function documentoDe(c: FiscalComprobante): { docTipo: number; docNro?: string } {
  const docNro = c.doc_nro ?? c.cuit_receptor ?? undefined
  return { docTipo: c.doc_tipo ?? (docNro ? 80 : 99), docNro }
}

// Helpers
export const TIPO_COMPROBANTE_LABELS: Record<number, string> = {
  1: 'Factura A',
  2: 'Nota de Débito A',
  3: 'Nota de Crédito A',
  6: 'Factura B',
  7: 'Nota de Débito B',
  8: 'Nota de Crédito B',
  11: 'Factura C',
  12: 'Nota de Débito C',
  13: 'Nota de Crédito C',
}

export const CONDICION_IVA_RECEPTOR: Record<number, string> = {
  1: 'Responsable Inscripto',
  4: 'IVA Sujeto Exento',
  5: 'Consumidor Final',
  6: 'Responsable Monotributo',
}

// Alícuotas IVA — para Factura A los precios van SIN IVA
// Para Factura B van CON IVA incluido
export const ALICUOTAS_IVA: Record<number, number> = {
  3: 0,
  4: 0.105,
  5: 0.21,
  6: 0.27,
}

// Dado un precio CON IVA y la alícuota, calcula el importe de IVA
export function calcularIVA(precioConIva: number, codigoAlicuota: number): number {
  const tasa = ALICUOTAS_IVA[codigoAlicuota] || 0
  return precioConIva - precioConIva / (1 + tasa)
}

// Dado un precio CON IVA, devuelve el precio SIN IVA (para Factura A)
export function precioSinIva(precioConIva: number, codigoAlicuota: number): number {
  const tasa = ALICUOTAS_IVA[codigoAlicuota] || 0
  return precioConIva / (1 + tasa)
}

// Condición de venta que se imprime en el comprobante, según cómo se cobró la venta
export function condicionDeVenta(metodoPago?: string | null): string {
  const condiciones: Record<string, string> = {
    cash: 'Contado',
    debit: 'Tarjeta de Débito',
    credit: 'Tarjeta de Crédito',
    transfer: 'Transferencia Bancaria',
    mixed: 'Otra',
  }
  return condiciones[metodoPago ?? ''] ?? 'Contado'
}

interface ItemDeVenta {
  product_id?: string
  product_name: string
  quantity: number
  price: number             // precio de venta, con IVA incluido
  barcode?: string | null
  alicuota_iva?: number
}

// Ítems fiscales de una venta para el comprobante `tipo`. Si se cobró menos que la suma de los
// precios (descuento), la diferencia va como bonificación en cada ítem; si se cobró más
// (recargo por tarjeta), va como un ítem aparte al 21%. Así el comprobante suma lo cobrado.
export function itemsDeVenta(items: ItemDeVenta[], totalCobrado: number, tipo: number): InvoiceItem[] {
  const esA = tipo <= 3
  const bruto = items.reduce((s, i) => s + i.price * i.quantity, 0)
  const bonificacion = bruto > 0 && totalCobrado < bruto - 0.005 ? 1 - totalCobrado / bruto : 0

  const lineas: InvoiceItem[] = items.map(i => {
    const alicuota = i.alicuota_iva ?? 5
    const precio = esA ? precioSinIva(i.price, alicuota) : i.price
    return {
      codigo: i.barcode || i.product_id?.slice(0, 8) || 'SIN-COD',
      descripcion: i.product_name.slice(0, 100),
      cantidad: i.quantity,
      precioUnitario: precio,
      importeBonificacion: precio * i.quantity * bonificacion,
      codigoAlicuotaIVA: alicuota,
      importeIVA: esA ? calcularIVA(i.price, alicuota) * (1 - bonificacion) : 0,
    }
  })

  const recargo = totalCobrado - bruto
  if (recargo > 0.005) {
    lineas.push({
      codigo: 'RECARGO',
      descripcion: 'Recargo financiero',
      cantidad: 1,
      precioUnitario: esA ? precioSinIva(recargo, 5) : recargo,
      codigoAlicuotaIVA: 5,
      importeIVA: esA ? calcularIVA(recargo, 5) : 0,
    })
  }
  return lineas
}

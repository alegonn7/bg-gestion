import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export interface FiscalConfig {
  fiscal_enabled: boolean
  cuit: string | null
  razon_social: string | null
  condicion_iva: string | null
  punto_venta: number
  actividad_afip: number | null
}

export interface FiscalComprobante {
  id: string
  sale_id: string | null
  tipo_cbte: number
  punto_venta: number
  numero: number
  fecha_emision: string
  cuit_receptor: string | null
  razon_social_receptor: string | null
  condicion_iva_receptor: number | null
  importe_total: number | null
  importe_neto: number | null
  importe_iva: number | null
  cae: string | null
  cae_vence: string | null
  resultado: string
  created_at: string
}

export type TipoComprobante = 1 | 2 | 3 | 6 | 7 | 8 | 11 | 12 | 13

export interface InvoiceItem {
  codigo: string
  codigoMtx?: string
  descripcion: string
  cantidad: number
  precioUnitario: number
  codigoAlicuotaIVA: number
  importeIVA: number
}

export interface EmitInvoiceParams {
  saleId?: string
  tipoComprobante: TipoComprobante
  cuitReceptor?: string
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
  importe: number
}

export interface SaveConfigParams {
  cuit: string
  razonSocial: string
  condicionIva: string
  puntoVenta: number
  actividadAfip: number
}

interface FiscalState {
  config: FiscalConfig | null
  developerCuit: string
  comprobantes: FiscalComprobante[]
  isLoading: boolean
  error: string | null

  fetchConfig: () => Promise<void>
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
  getComprobanteBySaleId: (saleId: string) => FiscalComprobante | undefined
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

async function callEdgeFunction(fnName: string, body: object) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('No hay sesión activa')

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify(body),
  })

  let data: any
  try {
    data = await res.json()
  } catch {
    throw new Error(`Error HTTP ${res.status}`)
  }
  if (!res.ok || !data.ok) throw new Error(data.error || data.message || `Error HTTP ${res.status}`)
  return data
}

export const useFiscalStore = create<FiscalState>((set, get) => ({
  config: null,
  developerCuit: '',
  comprobantes: [],
  isLoading: false,
  error: null,

  fetchConfig: async () => {
    set({ isLoading: true, error: null })
    try {
      const data = await callEdgeFunction('fiscal-setup', { action: 'get_config' })
      set({ config: data.config, developerCuit: data.developer_cuit || '', isLoading: false })
    } catch (err: any) {
      set({ error: err.message, isLoading: false })
    }
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
      set({ config: null, isLoading: false })
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

    const today = new Date().toISOString().split('T')[0]

    const result = await callEdgeFunction('fiscal-emit', {
      invoiceRequest: {
        tipoComprobante: tipoND,
        puntoVenta: config.punto_venta,
        fechaEmision: today,
        cuitReceptor: orig.cuit_receptor || undefined,
        razonSocialReceptor: orig.razon_social_receptor || undefined,
        condicionIVAReceptor: orig.condicion_iva_receptor ?? 5,
        items: [{
          codigo: 'ND',
          descripcion: params.concepto.slice(0, 100),
          cantidad: 1,
          precioUnitario: params.importe,
          codigoAlicuotaIVA: 3,  // exento
          importeIVA: 0,
        }],
        actividadAfip: config.actividad_afip,
        comprobantesAsociados: [{
          tipoComprobante: orig.tipo_cbte,
          puntoVenta: orig.punto_venta,
          numero: orig.numero,
          cuit: orig.cuit_receptor || '0',
          fechaEmision: orig.fecha_emision,
        }],
      },
      saleId: params.saleId || null,
      originalComprobanteId: orig.id,
    })

    await get().fetchComprobantes()
    return result
  },

  emitInvoice: async (params) => {
    const { config } = get()
    if (!config?.fiscal_enabled) throw new Error('Facturación no configurada')

    const today = new Date().toISOString().split('T')[0]

    const result = await callEdgeFunction('fiscal-emit', {
      invoiceRequest: {
        tipoComprobante: params.tipoComprobante,
        puntoVenta: config.punto_venta,
        fechaEmision: today,
        cuitReceptor: params.cuitReceptor,
        razonSocialReceptor: params.razonSocialReceptor,
        condicionIVAReceptor: params.condicionIVAReceptor,
        items: params.items,
        actividadAfip: config.actividad_afip,
      },
      saleId: params.saleId,
    })

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

    const today = new Date().toISOString().split('T')[0]

    const result = await callEdgeFunction('fiscal-emit', {
      invoiceRequest: {
        tipoComprobante: tipoNC,
        puntoVenta: config.punto_venta,
        fechaEmision: today,
        cuitReceptor: orig.cuit_receptor || undefined,
        razonSocialReceptor: orig.razon_social_receptor || undefined,
        condicionIVAReceptor: orig.condicion_iva_receptor ?? 5,
        items: params.items,
        actividadAfip: config.actividad_afip,
        comprobantesAsociados: [{
          tipoComprobante: orig.tipo_cbte,
          puntoVenta: orig.punto_venta,
          numero: orig.numero,
          cuit: orig.cuit_receptor || '0',
          fechaEmision: orig.fecha_emision,
        }],
      },
      saleId: params.saleId || null,
      originalComprobanteId: orig.id,
    })

    // Refrescar comprobantes
    await get().fetchComprobantes()
    return result
  },

  fetchComprobantes: async (limit = 50) => {
    try {
      const { data, error } = await supabase
        .from('fiscal_comprobantes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) throw error
      set({ comprobantes: data || [] })
    } catch (err: any) {
      console.error('Error fetching comprobantes:', err)
    }
  },

  getComprobanteBySaleId: (saleId) => {
    return get().comprobantes.find(c => c.sale_id === saleId && c.resultado !== 'R')
  },
}))

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

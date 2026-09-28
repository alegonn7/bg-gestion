import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { CaiRemito, ItemRemito, MotivoRemito, Remito } from '@/lib/remitos'
import { descargarRemito } from '@/lib/remitoPdf'
import { useAuthStore } from './auth'
import { callEdgeFunction, useFiscalStore } from './fiscal'

// Remitos R que se pueden emitir ahora: punto de venta y CAI vigente, próximo número y cuántos quedan
export interface DisponibilidadR {
  puntoVenta: number
  cai: string
  vencimiento: string
  siguiente: number
  quedan: number
}

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())

// Descarga el PDF con los datos del negocio: los fiscales si la facturación está configurada y,
// si no, el nombre de la organización y el domicilio de la sucursal
export async function descargarRemitoPdf(remito: Remito) {
  const { organization, branches } = useAuthStore.getState()
  const fiscal = useFiscalStore.getState()
  if (!fiscal.config) await fiscal.fetchConfig()
  const sucursal = branches.find(b => b.id === remito.branch_id)
  const destino = branches.find(b => b.id === remito.sucursal_destino_id)
  await descargarRemito(remito, {
    nombre: organization?.name || 'Mi Negocio',
    fiscal: useFiscalStore.getState().config,
    domicilioSucursal: sucursal?.address,
    sucursalDestino: destino?.name,
    logoUrl: organization?.logo_url,
  })
}

export interface NuevoRemito {
  tipo?: 'X' | 'R'           // X por defecto
  puntoVenta?: number        // solo R: el del CAI vigente
  motivo: MotivoRemito
  saleId?: string | null
  destinatarioNombre?: string
  destinatarioDocTipo?: number | null
  destinatarioDocNro?: string
  domicilioEntrega?: string
  sucursalDestinoId?: string | null
  transportista?: string
  observaciones?: string
  items: ItemRemito[]
}

export interface FiltrosRemitos {
  texto: string
  motivo: MotivoRemito | ''
  desde: string    // YYYY-MM-DD
  hasta: string
  pagina: number
}

export const REMITOS_POR_PAGINA = 20

interface RemitosState {
  remitos: Remito[]
  total: number
  isLoading: boolean
  error: string | null

  buscar: (filtros: FiltrosRemitos) => Promise<void>
  crear: (nuevo: NuevoRemito) => Promise<Remito>
  anular: (id: string) => Promise<void>
  remitosDeVentas: (saleIds: string[]) => Promise<Remito[]>

  // CAI para remitos R
  cais: CaiRemito[]
  fetchCais: () => Promise<void>
  solicitarCai: (params: { cantidad: number; clave: string; usuario?: string }) => Promise<CaiRemito>
  avanzarCai: (id: string, credenciales: { clave: string; usuario?: string }) => Promise<CaiRemito>
  cargarCai: (params: { puntoVenta: number; cai: string; vencimiento: string; desde: number; hasta: number }) => Promise<void>
  borrarCai: (id: string) => Promise<void>
  disponibilidadR: () => Promise<DisponibilidadR | null>
}

export const useRemitosStore = create<RemitosState>((set, get) => ({
  remitos: [],
  total: 0,
  isLoading: false,
  error: null,
  cais: [],

  buscar: async (filtros) => {
    set({ isLoading: true, error: null })
    try {
      const desde = (filtros.pagina - 1) * REMITOS_POR_PAGINA
      let query = supabase
        .from('remitos')
        .select('*', { count: 'exact' })
        .order('fecha', { ascending: false })
        .order('numero', { ascending: false })
        .range(desde, desde + REMITOS_POR_PAGINA - 1)

      if (filtros.motivo) query = query.eq('motivo', filtros.motivo)
      if (filtros.desde) query = query.gte('fecha', filtros.desde)
      if (filtros.hasta) query = query.lte('fecha', filtros.hasta)
      const texto = filtros.texto.trim().replace(/[,()]/g, ' ')
      if (texto) {
        const numero = Number(texto.replace(/\D/g, ''))
        query = query.or([
          `destinatario_nombre.ilike.%${texto}%`,
          `destinatario_doc_nro.ilike.%${texto.replace(/\D/g, '') || texto}%`,
          ...(numero ? [`numero.eq.${numero}`] : []),
        ].join(','))
      }

      const { data, error, count } = await query
      if (error) throw error
      set({ remitos: (data || []) as Remito[], total: count ?? 0, isLoading: false })
    } catch (err: any) {
      set({ error: err.message, isLoading: false })
    }
  },

  crear: async (nuevo) => {
    const { user, organization, selectedBranch, branch } = useAuthStore.getState()
    if (!organization) throw new Error('No hay una organización activa')
    if (!nuevo.items.some(i => i.descripcion.trim() && i.cantidad > 0)) {
      throw new Error('Agregá al menos un producto con cantidad')
    }

    const { data, error } = await supabase
      .from('remitos')
      .insert({
        organization_id: organization.id,
        branch_id: selectedBranch?.id ?? branch?.id ?? null,
        // El número (y en el R, el CAI) lo asigna la base al guardar
        tipo: nuevo.tipo ?? 'X',
        punto_venta: nuevo.tipo === 'R' ? nuevo.puntoVenta : 1,
        motivo: nuevo.motivo,
        sale_id: nuevo.saleId || null,
        destinatario_nombre: nuevo.destinatarioNombre?.trim() || null,
        destinatario_doc_tipo: nuevo.destinatarioDocNro?.trim() ? nuevo.destinatarioDocTipo ?? 96 : null,
        destinatario_doc_nro: nuevo.destinatarioDocNro?.replace(/\D/g, '') || null,
        domicilio_entrega: nuevo.domicilioEntrega?.trim() || null,
        sucursal_destino_id: nuevo.sucursalDestinoId || null,
        transportista: nuevo.transportista?.trim() || null,
        observaciones: nuevo.observaciones?.trim() || null,
        items: nuevo.items
          .filter(i => i.descripcion.trim() && i.cantidad > 0)
          .map(i => ({
            codigo: i.codigo.trim(),
            descripcion: i.descripcion.trim(),
            cantidad: i.cantidad,
            ...(i.precio != null && i.precio >= 0 && Number.isFinite(i.precio) ? { precio: i.precio } : {}),
          })),
        created_by: user?.id ?? null,
      })
      .select('*')
      .single()

    if (error) throw error
    return data as Remito
  },

  anular: async (id) => {
    const { error } = await supabase.from('remitos').update({ estado: 'anulado' }).eq('id', id)
    if (error) throw error
    set(state => ({ remitos: state.remitos.map(r => (r.id === id ? { ...r, estado: 'anulado' } : r)) }))
  },

  // Remitos de las ventas que se están mostrando (para el Historial de Ventas)
  remitosDeVentas: async (saleIds) => {
    if (!saleIds.length) return []
    const { data, error } = await supabase
      .from('remitos')
      .select('*')
      .in('sale_id', saleIds)
      .order('numero', { ascending: true })
    if (error) throw error
    return (data || []) as Remito[]
  },

  fetchCais: async () => {
    const { data, error } = await supabase.from('remitos_cai').select('*').order('created_at', { ascending: false })
    if (error) throw error
    set({ cais: (data || []) as CaiRemito[] })
  },

  solicitarCai: async (params) => {
    const data = await callEdgeFunction('fiscal-setup', { action: 'cai_solicitar', ...params })
    await get().fetchCais()
    return data.cai as CaiRemito
  },

  // La clave fiscal hace falta en cada paso (buscar/crear el punto de venta y pedir el CAI)
  avanzarCai: async (id, credenciales) => {
    const data = await callEdgeFunction('fiscal-setup', { action: 'cai_avanzar', id, ...credenciales })
    set(state => ({ cais: state.cais.map(c => (c.id === id ? data.cai : c)) }))
    return data.cai as CaiRemito
  },

  cargarCai: async (params) => {
    await callEdgeFunction('fiscal-setup', { action: 'cai_cargar', ...params })
    await get().fetchCais()
  },

  borrarCai: async (id) => {
    await callEdgeFunction('fiscal-setup', { action: 'cai_borrar', id })
    await get().fetchCais()
  },

  disponibilidadR: async () => {
    await get().fetchCais()
    const vigentes = get().cais.filter(c => c.estado === 'vigente' && c.cai && c.vencimiento && c.vencimiento >= hoy())
    if (!vigentes.length) return null

    // Se usa el punto de venta del CAI vigente más antiguo (el que se va a agotar primero)
    const vigentesConRango = vigentes
      .filter(c => c.punto_venta && c.desde && c.hasta)
      .map(c => ({ ...c, punto_venta: c.punto_venta!, desde: c.desde!, hasta: c.hasta! }))
      .sort((a, b) => a.desde - b.desde)
    if (!vigentesConRango.length) return null
    const puntoVenta = vigentesConRango[0].punto_venta
    const delPunto = vigentesConRango.filter(c => c.punto_venta === puntoVenta)
    const { data: ultimo } = await supabase
      .from('remitos')
      .select('numero')
      .eq('tipo', 'R')
      .eq('punto_venta', puntoVenta)
      .order('numero', { ascending: false })
      .limit(1)
      .maybeSingle()
    const proximo = (ultimo?.numero ?? 0) + 1
    const actual = delPunto.find(c => c.hasta >= proximo)
    if (!actual) return null

    const siguiente = Math.max(proximo, actual.desde)
    const quedan = delPunto.reduce((s, c) => s + Math.max(0, c.hasta - Math.max(c.desde, siguiente) + 1), 0)
    return { puntoVenta, cai: actual.cai!, vencimiento: actual.vencimiento!, siguiente, quedan }
  },
}))

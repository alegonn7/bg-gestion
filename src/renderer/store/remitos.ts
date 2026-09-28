import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { ItemRemito, MotivoRemito, Remito } from '@/lib/remitos'
import { descargarRemito } from '@/lib/remitoPdf'
import { useAuthStore } from './auth'
import { useFiscalStore } from './fiscal'

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
}

export const useRemitosStore = create<RemitosState>((set) => ({
  remitos: [],
  total: 0,
  isLoading: false,
  error: null,

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
        tipo: 'X',
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
          .map(i => ({ codigo: i.codigo.trim(), descripcion: i.descripcion.trim(), cantidad: i.cantidad })),
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
}))

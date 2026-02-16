import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'

export interface ScannedItem {
  id: string
  barcode: string
  product_branch_id: string | null
  branch_id: string
  scanned_at: string
  scanned_by: string | null
  device_id: string | null
  device_type: string | null
  is_viewed: boolean
  created_at: string
  // Datos del producto (join)
  product?: {
    id: string
    name: string
    barcode: string
    price_sale: number
    price_cost: number
    stock_quantity: number
    category_id: string | null
  }
}

type ScannerMode = 'idle' | 'waiting' // idle = solo muestra, waiting = esperando para acción

interface ScannerState {
  lastScan: ScannedItem | null
  history: ScannedItem[]
  isListening: boolean
  mode: ScannerMode
  unviewedCount: number

  // Actions
  startListening: () => void
  stopListening: () => void
  setMode: (mode: ScannerMode) => void
  fetchHistory: () => Promise<void>
  markAsViewed: (id: string) => Promise<void>
  clearHistory: () => Promise<void>
}

let realtimeChannel: any = null

export const useScannerStore = create<ScannerState>((set, get) => ({
  lastScan: null,
  history: [],
  isListening: false,
  mode: 'idle',
  unviewedCount: 0,

  startListening: () => {
    const { user } = useAuthStore.getState()
    if (!user || realtimeChannel) return

    // Suscribirse a cambios en scanned_items de la sucursal del usuario
    realtimeChannel = supabase
      .channel('scanner-channel')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'scanned_items',
          filter: `branch_id=eq.${user.branch_id}`
        },
        async (payload) => {
          const newScan = payload.new as ScannedItem

          // Buscar datos del producto por barcode
          let product = null
          if (newScan.barcode) {
            const { data } = await supabase
              .from('products_branch')
              .select('id, name, barcode, price_sale, price_cost, stock_quantity, category_id')
              .eq('branch_id', user.branch_id)
              .eq('barcode', newScan.barcode)
              .single()
            product = data
          } else if (newScan.product_branch_id) {
            const { data } = await supabase
              .from('products_branch')
              .select('id, name, barcode, price_sale, price_cost, stock_quantity, category_id')
              .eq('id', newScan.product_branch_id)
              .single()
            product = data
          }

          const enrichedScan: ScannedItem = {
            ...newScan,
            product: product || undefined
          }

          set((state) => ({
            lastScan: enrichedScan,
            history: [enrichedScan, ...state.history].slice(0, 50), // máximo 50 en memoria
            unviewedCount: state.unviewedCount + 1
          }))
        }
      )
      .subscribe()

    set({ isListening: true })

    // Cargar historial inicial
    get().fetchHistory()
  },

  stopListening: () => {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel)
      realtimeChannel = null
    }
    set({ isListening: false })
  },

  setMode: (mode) => set({ mode }),

  fetchHistory: async () => {
    const { user } = useAuthStore.getState()
    if (!user) return

    const { data, error } = await supabase
      .from('scanned_items')
      .select(`
        *,
        products_branch(
          id, name, barcode, price_sale, price_cost, stock_quantity, category_id
        )
      `)
      .eq('branch_id', user.branch_id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('Error fetching scan history:', error)
      return
    }

    const history: ScannedItem[] = (data || []).map((item: any) => ({
      ...item,
      product: item.products_branch || undefined
    }))

    const unviewedCount = history.filter(h => !h.is_viewed).length

    set({ history, unviewedCount })
  },

  markAsViewed: async (id: string) => {
    await supabase
      .from('scanned_items')
      .update({ is_viewed: true })
      .eq('id', id)

    set((state) => ({
      history: state.history.map(h =>
        h.id === id ? { ...h, is_viewed: true } : h
      ),
      unviewedCount: Math.max(0, state.unviewedCount - 1)
    }))
  },

  clearHistory: async () => {
    const { user } = useAuthStore.getState()
    if (!user) return

    await supabase
      .from('scanned_items')
      .delete()
      .eq('branch_id', user.branch_id)

    set({ history: [], lastScan: null, unviewedCount: 0 })
  }
}))
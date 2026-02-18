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
      barcode: string
      price_sale: number
      price_cost: number
      price_sale_usd: number | null
      price_cost_usd: number | null
      stock_quantity: number
      product?: {
        name: string
        category_id: string | null
      }
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
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempts = 0
  let isIntentionallyClosed = false
  const MAX_RECONNECT_ATTEMPTS = 5

  const setupListener = (branchId: string, _user: any, _selectedBranch: any, setFn: (fn: (state: ScannerState) => Partial<ScannerState>) => void) => {
    // Marcar como cierre intencional para que el callback CLOSED no dispare reconexión
    isIntentionallyClosed = true
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel)
      realtimeChannel = null
    }
    isIntentionallyClosed = false

    console.log('🔄 Configurando Realtime listener para branch:', branchId)

    const channelName = `scanner-${branchId}-${Date.now()}`

    realtimeChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'scanned_items',
          filter: `branch_id=eq.${branchId}`,
        },
        async (payload) => {
          console.log('✅ Scanner: Nuevo escaneo recibido:', payload)
          const newScan = payload.new as ScannedItem

          let product: ScannedItem['product'] | null = null
          if (newScan.barcode) {
            const { data } = await supabase
              .from('products_branch')
              .select('id, barcode, price_sale, price_cost, price_sale_usd, price_cost_usd, stock_quantity, product:products(name, category_id)')
              .eq('branch_id', branchId)
              .eq('barcode', newScan.barcode)
              .single()
            product = data as any
            if (product) {
              console.log('📦 Producto encontrado por barcode:', (product as any)?.product?.name)
            } else {
              console.log('⚠️ Producto con barcode', newScan.barcode, 'no encontrado')
            }
          } else if (newScan.product_branch_id) {
            const { data } = await supabase
              .from('products_branch')
              .select('id, barcode, price_sale, price_cost, price_sale_usd, price_cost_usd, stock_quantity, product:products(name, category_id)')
              .eq('id', newScan.product_branch_id)
              .single()
            product = data as any
            console.log('📦 Producto encontrado por ID:', (product as any)?.product?.name)
          }

          const enrichedScan: ScannedItem = {
            ...newScan,
            product: product || undefined,
          }

          setFn((state) => ({
            lastScan: enrichedScan,
            history: [enrichedScan, ...state.history].slice(0, 50),
            unviewedCount: state.unviewedCount + 1,
          }))
        }
      )
      .subscribe((status, err) => {
        console.log('🔌 Realtime status:', status, err ? `- Error: ${err.message}` : '')

        if (status === 'SUBSCRIBED') {
          reconnectAttempts = 0
          console.log('✅ Realtime listener conectado exitosamente')
          return
        }

        // Ignorar si fue un cierre intencional (stopListening o re-setup)
        if (isIntentionallyClosed) {
          console.log('ℹ️ Cierre intencional, no reconectar')
          return
        }

        if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          reconnectAttempts++
          if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
            console.error('❌ Realtime: Máximo de reintentos alcanzado (' + MAX_RECONNECT_ATTEMPTS + ')')
            console.error('❌ Verifica: Database → Replication → supabase_realtime incluya scanned_items')
            console.error('❌ Ejecuta: ALTER TABLE scanned_items REPLICA IDENTITY FULL;')
            return
          }
          console.warn(`⚠️ Realtime ${status} (intento ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}), reconectando en 5s...`)
          if (reconnectTimeout) clearTimeout(reconnectTimeout)
          reconnectTimeout = setTimeout(() => {
            if (!isIntentionallyClosed) {
              const state = useAuthStore.getState()
              setupListener(branchId, state.user, state.selectedBranch, setFn)
            }
          }, 5000)
        }
      })
  }

  export const useScannerStore = create<ScannerState>((set, get) => ({
    lastScan: null,
    history: [],
    isListening: false,
    mode: 'idle',
    unviewedCount: 0,

    startListening: () => {
      const { user, selectedBranch } = useAuthStore.getState()

      if (!user) {
        console.error('❌ No hay usuario autenticado')
        return
      }

      // Empleados usan su branch_id asignado, admin/owner usan selectedBranch
      const branchId = user.role === 'employee' || user.role === 'manager' ? user.branch_id : selectedBranch?.id

      if (!branchId) {
        console.error('❌ No hay sucursal asignada. No se puede iniciar listener.')
        return
      }

      const branchName = user.role === 'employee' || user.role === 'manager' ? `Tu sucursal (${user.branch_id})` : selectedBranch?.name

      console.log('🎯 Scanner: Iniciando listener para:', branchName)

      reconnectAttempts = 0 // Resetear intentos al iniciar
      setupListener(branchId, user, selectedBranch, set)

      set({ isListening: true })
      console.log('✅ Scanner listener iniciado')

      // Cargar historial inicial
      get().fetchHistory()
    },

    stopListening: () => {
      isIntentionallyClosed = true
      if (reconnectTimeout) clearTimeout(reconnectTimeout)
      if (realtimeChannel) {
        console.log('🛑 Scanner: Deteniendo listener')
        supabase.removeChannel(realtimeChannel)
        realtimeChannel = null
      }
      set({ isListening: false })
    },

    setMode: (mode) => set({ mode }),

    fetchHistory: async () => {
      const { user, selectedBranch } = useAuthStore.getState()
      
      if (!user) {
        console.log('⚠️ Usuario no autenticado')
        return
      }

      const branchId = user.role === 'employee' || user.role === 'manager' 
        ? user.branch_id 
        : selectedBranch?.id

      if (!branchId) {
        console.log('⚠️ No hay sucursal asignada')
        return
      }

      const branchName = user.role === 'employee' || user.role === 'manager' 
        ? `Tu sucursal`
        : selectedBranch?.name

      console.log('📥 Cargando historial de escaneos para:', branchName)

      const { data, error } = await supabase
        .from('scanned_items')
        .select(`
          *,
          products_branch(
            id, barcode, price_sale, price_cost, price_sale_usd, price_cost_usd, stock_quantity,
            product:products(name, category_id)
          )
        `)
        .eq('branch_id', branchId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) {
        console.error('❌ Error fetching scan history:', error)
        return
      }

      console.log('✅ Historial cargado:', data?.length || 0, 'escaneos')

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
      const { user, selectedBranch } = useAuthStore.getState()
      
      if (!user) {
        console.log('⚠️ Usuario no autenticado')
        return
      }

      const branchId = user.role === 'employee' || user.role === 'manager' 
        ? user.branch_id 
        : selectedBranch?.id

      if (!branchId) {
        console.log('⚠️ No hay sucursal asignada')
        return
      }

      console.log('🗑️ Eliminando historial de escaneos para branch:', branchId)

      // Primero obtener los IDs para eliminar
      const { data: items, error: fetchError } = await supabase
        .from('scanned_items')
        .select('id')
        .eq('branch_id', branchId)

      if (fetchError) {
        console.error('❌ Error obteniendo items para eliminar:', fetchError)
        return
      }

      if (!items || items.length === 0) {
        console.log('ℹ️ No hay items para eliminar')
        set({ history: [], lastScan: null, unviewedCount: 0 })
        return
      }

      const ids = items.map(i => i.id)
      console.log(`🗑️ Eliminando ${ids.length} registros de scanned_items`)

      // Eliminar en lotes de 100 para evitar limitaciones
      for (let i = 0; i < ids.length; i += 100) {
        const batch = ids.slice(i, i + 100)
        const { error } = await supabase
          .from('scanned_items')
          .delete()
          .in('id', batch)

        if (error) {
          console.error('❌ Error eliminando lote:', error)
          return
        }
      }

      console.log('✅ Historial eliminado exitosamente')
      set({ history: [], lastScan: null, unviewedCount: 0 })
    }
  }))
import { create } from 'zustand'

interface DollarState {
  blueRate: number | null // Precio venta del dólar blue
  blueBuyRate: number | null // Precio compra del dólar blue
  lastUpdated: string | null
  isLoading: boolean
  error: string | null

  fetchBlueRate: () => Promise<void>
  convertUsdToArs: (usd: number) => number | null
}

export const useDollarStore = create<DollarState>((set, get) => ({
  blueRate: null,
  blueBuyRate: null,
  lastUpdated: null,
  isLoading: false,
  error: null,

  fetchBlueRate: async () => {
    // No refetchear si ya tenemos datos de hace menos de 5 minutos
    const { lastUpdated, blueRate } = get()
    if (blueRate && lastUpdated) {
      const diff = Date.now() - new Date(lastUpdated).getTime()
      if (diff < 5 * 60 * 1000) return // 5 minutos de cache
    }

    set({ isLoading: true, error: null })

    try {
      // API pública del dólar blue argentino
      const response = await fetch('https://dolarapi.com/v1/dolares/blue')
      
      if (!response.ok) throw new Error('Error al obtener cotización')

      const data = await response.json()

      // La API devuelve: { moneda, casa, nombre, compra, venta, fechaActualizacion }
      set({
        blueRate: data.venta,
        blueBuyRate: data.compra,
        lastUpdated: data.fechaActualizacion || new Date().toISOString(),
        isLoading: false,
      })

      console.log(`💵 Dólar Blue: Compra $${data.compra} / Venta $${data.venta}`)
    } catch (error: any) {
      console.error('Error fetching blue rate:', error)
      
      // Fallback: intentar otra API
      try {
        const response = await fetch('https://api.bluelytics.com.ar/v2/latest')
        if (!response.ok) throw new Error('Fallback API failed')
        
        const data = await response.json()
        
        set({
          blueRate: data.blue?.value_sell,
          blueBuyRate: data.blue?.value_buy,
          lastUpdated: new Date().toISOString(),
          isLoading: false,
        })

        console.log(`💵 Dólar Blue (fallback): Compra $${data.blue?.value_buy} / Venta $${data.blue?.value_sell}`)
      } catch {
        set({ 
          error: 'No se pudo obtener la cotización del dólar blue',
          isLoading: false 
        })
      }
    }
  },

  convertUsdToArs: (usd: number) => {
    const { blueRate } = get()
    if (!blueRate || !usd) return null
    return Math.round(usd * blueRate * 100) / 100
  },
}))

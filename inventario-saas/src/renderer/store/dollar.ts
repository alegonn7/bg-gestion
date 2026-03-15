import { create } from 'zustand'

import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'

interface DollarState {
  blueRate: number | null // Precio venta del dólar blue
  blueBuyRate: number | null // Precio compra del dólar blue
  lastUpdated: string | null
  isLoading: boolean
  error: string | null

  // NUEVO: modo manual y valores manuales
  manualMode: boolean
  manualBlueRate: number | null
  manualBlueBuyRate: number | null

  setManualMode: (manual: boolean) => Promise<void>
  setManualRates: (venta: number, compra: number) => Promise<void>

  fetchBlueRate: () => Promise<void>
  convertUsdToArs: (usd: number) => number | null
  syncFromOrg: () => void
}

export const useDollarStore = create<DollarState>((set, get) => ({
  blueRate: null,
  blueBuyRate: null,
  lastUpdated: null,
  isLoading: false,
  error: null,
  manualMode: false,
  manualBlueRate: null,
  manualBlueBuyRate: null,

  // Sincroniza desde metadata de la organización
  syncFromOrg: () => {
    const org = useAuthStore.getState().organization;
    const meta = org?.metadata || {};
    set({
      manualMode: !!meta.dollar_manual_mode,
      manualBlueRate: meta.dollar_manual_blue_rate ?? null,
      manualBlueBuyRate: meta.dollar_manual_blue_buy_rate ?? null,
    });
  },

  setManualMode: async (manual: boolean) => {
    const org = useAuthStore.getState().organization;
    if (!org) return;
    const meta = { ...org.metadata, dollar_manual_mode: manual };
    // Actualizar en BD
    await supabase
      .from('organizations')
      .update({ metadata: meta })
      .eq('id', org.id);
    // Actualizar en el store de auth
    useAuthStore.setState((state) => ({
      organization: state.organization ? { ...state.organization, metadata: meta } : null,
    }));
    set({ manualMode: manual });
  },

  setManualRates: async (venta: number, compra: number) => {
    const org = useAuthStore.getState().organization;
    if (!org) return;
    const meta = {
      ...org.metadata,
      dollar_manual_blue_rate: venta,
      dollar_manual_blue_buy_rate: compra,
    };
    await supabase
      .from('organizations')
      .update({ metadata: meta })
      .eq('id', org.id);
    useAuthStore.setState((state) => ({
      organization: state.organization ? { ...state.organization, metadata: meta } : null,
    }));
    set({ manualBlueRate: venta, manualBlueBuyRate: compra });
  },

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
    const { manualMode, manualBlueRate, blueRate } = get();
    const rate = manualMode ? manualBlueRate : blueRate;
    if (!rate || !usd) return null;
    return Math.round(usd * rate * 100) / 100;
  },
}))

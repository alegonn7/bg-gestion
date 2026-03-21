import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export interface ExtraMovement {
  id: string
  cash_register_id: string
  type: 'gasto' | 'ingreso'
  amount: number
  description: string
  created_by: string
  created_by_name?: string
  created_at: string
}

interface ExtraMovementsState {
  movements: ExtraMovement[]
  isLoading: boolean
  error: string | null
  fetchByRegister: (cashRegisterId: string) => Promise<void>
  addMovement: (data: Omit<ExtraMovement, 'id' | 'created_at' | 'created_by_name'>) => Promise<void>
}

export const useExtraMovementsStore = create<ExtraMovementsState>((set, get) => ({
  movements: [],
  isLoading: false,
  error: null,

  fetchByRegister: async (cashRegisterId) => {
    set({ isLoading: true, error: null })
    const { data, error } = await supabase
      .from('extra_movements')
      .select('*')
      .eq('cash_register_id', cashRegisterId)
      .order('created_at', { ascending: true })
    if (error) set({ error: error.message, isLoading: false })
    else set({ movements: data || [], isLoading: false })
  },

  addMovement: async (movement) => {
    set({ isLoading: true, error: null })
    const { user } = (await import('@/store/auth')).useAuthStore.getState()
    if (!user) {
      set({ error: 'Usuario no autenticado.', isLoading: false })
      return
    }
    const { data, error } = await supabase
      .from('extra_movements')
      .insert({ ...movement, created_by: user.id })
      .select()
      .single()
    if (error) set({ error: error.message, isLoading: false })
    else set({ isLoading: false })
    // Refetch
    await get().fetchByRegister(movement.cash_register_id)
  }
}))

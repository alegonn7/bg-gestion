import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'
import { loadMeta, saveMeta } from '@/lib/offline'

/** Clave de la copia local, separada por organización */
const cacheKey = (organizationId: string) => `suppliers:${organizationId}`

export interface Supplier {
  id: string
  organization_id: string
  name: string
  email?: string
  phone?: string
  address?: string
  notes?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

interface SuppliersState {
  suppliers: Supplier[]
  isLoading: boolean
  error: string | null
  fetchSuppliers: () => Promise<void>
  addSupplier: (data: Omit<Supplier, 'id' | 'created_at' | 'updated_at' | 'organization_id' | 'is_active'>) => Promise<void>
  updateSupplier: (id: string, updates: Partial<Supplier>) => Promise<void>
  deleteSupplier: (id: string) => Promise<void>
}

export const useSuppliersStore = create<SuppliersState>((set, get) => ({
  suppliers: [],
  isLoading: false,
  error: null,

  fetchSuppliers: async () => {
    set({ isLoading: true, error: null })
    try {
      const { organization } = useAuthStore.getState()
      if (!organization) throw new Error('No organization')
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('organization_id', organization.id)
        .eq('is_active', true)
        .order('name', { ascending: true })
      if (error) throw error
      set({ suppliers: data || [], isLoading: false })

      // Copia local para que el filtro por proveedor funcione sin conexión
      void saveMeta(cacheKey(organization.id), data || [])
    } catch (error: any) {
      const organizationId = useAuthStore.getState().organization?.id
      const cached = organizationId
        ? await loadMeta<Supplier[]>(cacheKey(organizationId))
        : null

      if (cached && cached.length > 0) {
        console.warn(`📴 Proveedores cargados desde la caché local (${cached.length})`)
        set({ suppliers: cached, isLoading: false, error: null })
        return
      }

      set({ error: error.message, isLoading: false })
    }
  },

  addSupplier: async (data) => {
    try {
      const { organization } = useAuthStore.getState()
      if (!organization) throw new Error('No organization')
      const { error } = await supabase
        .from('suppliers')
        .insert({ ...data, organization_id: organization.id })
      if (error) throw error
      await get().fetchSuppliers()
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  updateSupplier: async (id, updates) => {
    try {
      const { error } = await supabase
        .from('suppliers')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      await get().fetchSuppliers()
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  deleteSupplier: async (id) => {
    try {
      const { error } = await supabase
        .from('suppliers')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      await get().fetchSuppliers()
    } catch (error: any) {
      set({ error: error.message })
    }
  },
}))

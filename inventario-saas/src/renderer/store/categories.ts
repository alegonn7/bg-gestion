import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from './auth'

export interface Category {
  id: string
  organization_id: string
  name: string
  color: string
  is_active: boolean
  created_at: string
  updated_at: string
  
  // Stats calculadas
  products_count?: number
}

interface CategoriesState {
  categories: Category[]
  isLoading: boolean
  error: string | null

  // Actions
  fetchCategories: () => Promise<void>
  createCategory: (category: Partial<Category>) => Promise<void>
  updateCategory: (id: string, updates: Partial<Category>) => Promise<void>
  deleteCategory: (id: string) => Promise<void>
  getCategoryStats: (categoryId: string) => Promise<number>
}

export const useCategoriesStore = create<CategoriesState>((set, get) => ({
  categories: [],
  isLoading: false,
  error: null,

  fetchCategories: async () => {
    set({ isLoading: true, error: null })

    try {
      const { organization } = useAuthStore.getState()

      if (!organization) throw new Error('No organization')

      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('organization_id', organization.id)
        .order('name')

      if (error) throw error

      // Obtener stats para cada categoría
      const categoriesWithStats = await Promise.all(
        (data || []).map(async (category) => {
          const count = await get().getCategoryStats(category.id)
          return {
            ...category,
            products_count: count
          }
        })
      )

      set({ 
        categories: categoriesWithStats,
        isLoading: false 
      })

    } catch (error: any) {
      console.error('Error fetching categories:', error)
      set({ 
        error: error.message,
        isLoading: false 
      })
    }
  },

  createCategory: async (categoryData) => {
    try {
      const { organization } = useAuthStore.getState()

      if (!organization) throw new Error('No organization')

      const { data, error } = await supabase
        .from('categories')
        .insert({
          ...categoryData,
          organization_id: organization.id,
        })
        .select()
        .single()

      if (error) throw error

      // Agregar a la lista local con count en 0
      set(state => ({
        categories: [
          { ...data, products_count: 0 },
          ...state.categories
        ].sort((a, b) => a.name.localeCompare(b.name))
      }))

    } catch (error: any) {
      console.error('Error creating category:', error)
      throw error
    }
  },

  updateCategory: async (id, updates) => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      // Actualizar en la lista local manteniendo stats
      set(state => ({
        categories: state.categories.map(c => 
          c.id === id ? { ...c, ...data } : c
        ).sort((a, b) => a.name.localeCompare(b.name))
      }))

    } catch (error: any) {
      console.error('Error updating category:', error)
      throw error
    }
  },

  deleteCategory: async (id) => {
    try {
      const category = get().categories.find(c => c.id === id)
      if (!category) throw new Error('Categoría no encontrada')

      // Verificar que no tenga productos
      const count = await get().getCategoryStats(id)
      if (count > 0) {
        throw new Error(
          `No se puede eliminar la categoría "${category.name}" porque tiene ${count} productos asignados. Reasigna los productos primero.`
        )
      }

      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id)

      if (error) throw error

      // Remover de la lista local
      set(state => ({
        categories: state.categories.filter(c => c.id !== id)
      }))

    } catch (error: any) {
      console.error('Error deleting category:', error)
      throw error
    }
  },

  getCategoryStats: async (categoryId: string) => {
    try {
      const { count } = await supabase
        .from('products_branch')
        .select('*', { count: 'exact', head: true })
        .eq('category_id', categoryId)
        .eq('is_active', true)

      return count || 0
    } catch (error) {
      console.error('Error getting category stats:', error)
      return 0
    }
  }
}))
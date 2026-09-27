import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// Cliente con anon key para operaciones regulares (respeta RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

/**
 * Borra la sesión persistida de Supabase.
 *
 * `signOut()` necesita llegar al servidor para invalidar el token; si no hay conexión
 * devuelve error y deja la sesión guardada en el navegador. Esto la limpia igual para
 * que "Cerrar sesión" funcione también sin internet.
 */
export function clearStoredSession() {
  try {
    Object.keys(localStorage)
      .filter(key => key.startsWith('sb-') && key.includes('-auth-token'))
      .forEach(key => localStorage.removeItem(key))
  } catch (error) {
    console.warn('No se pudo limpiar la sesión guardada:', error)
  }
}

// Tipos básicos
export interface Organization {
  id: string
  name: string
  slug: string
  plan: string
  subscription_status: string
  max_branches: number
  max_products_per_branch: number
  max_users_per_branch: number
  is_active: boolean
  logo_url: string | null
  metadata?: any
  fiscal_enabled?: boolean
  cuit?: string | null
  razon_social?: string | null
  condicion_iva?: string | null
  punto_venta?: number | null
}

export interface User {
  id: string
  auth_id: string
  email: string
  full_name: string | null
  organization_id: string
  branch_id: string | null
  role: 'owner' | 'admin' | 'manager' | 'employee'
  is_active: boolean
}

export interface Branch {
  id: string
  organization_id: string
  name: string
  address: string | null
  phone: string | null
  is_active: boolean
}
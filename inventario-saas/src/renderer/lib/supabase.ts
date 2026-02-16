import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabaseServiceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY

// DEBUG: Ver qué valores tiene
console.log('VITE_SUPABASE_URL:', supabaseUrl)
console.log('VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? '✓ Definida' : '✗ Falta')
console.log('VITE_SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceRoleKey ? '✓ Definida' : '✗ Falta')

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

// Cliente normal para operaciones regulares
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

// Cliente admin para operaciones privilegiadas (crear usuarios, etc)
// IMPORTANTE: Solo usar desde el backend/Electron, NUNCA exponer en el frontend web
export const supabaseAdmin = supabaseServiceRoleKey 
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null

// Verificar que tenemos el cliente admin
if (!supabaseAdmin) {
  console.warn('⚠️ ADVERTENCIA: VITE_SUPABASE_SERVICE_ROLE_KEY no está configurada. Las funciones de admin (crear usuarios) no funcionarán.')
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
import { useState, useEffect } from 'react'
import { X, Eye, EyeOff } from 'lucide-react'
import { useUsersStore } from '@/store/users'
import { useAuthStore } from '@/store/auth'
import { useBranchesStore } from '@/store/branches'

interface InviteUserModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function InviteUserModal({ isOpen, onClose, onSuccess }: InviteUserModalProps) {
  const { inviteUser } = useUsersStore()
  const { user: currentUser } = useAuthStore()
  const { branches, fetchBranches } = useBranchesStore()
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'employee' as 'admin' | 'manager' | 'employee',
    branch_id: '',
  })

  useEffect(() => {
    if (isOpen) {
      fetchBranches()
      
      // Reset form
      setFormData({
        email: '',
        password: '',
        full_name: '',
        role: currentUser?.role === 'manager' ? 'employee' : 'employee',
        branch_id: currentUser?.role === 'manager' ? (currentUser.branch_id || '') : '',
      })
      setError('')
      setShowPassword(false)
    }
  }, [isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    setError('')
    setLoading(true)

    try {
      // Validaciones
      if (!formData.email.trim()) {
        throw new Error('El email es obligatorio')
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        throw new Error('El email no es válido')
      }

      if (!formData.password || formData.password.length < 6) {
        throw new Error('La contraseña debe tener al menos 6 caracteres')
      }

      if (!formData.full_name.trim()) {
        throw new Error('El nombre completo es obligatorio')
      }

      // Si es manager o employee, requiere sucursal
      if ((formData.role === 'manager' || formData.role === 'employee') && !formData.branch_id) {
        throw new Error('Debes asignar una sucursal para este rol')
      }

      await inviteUser({
        email: formData.email.trim(),
        password: formData.password,
        full_name: formData.full_name.trim(),
        role: formData.role,
        branch_id: formData.branch_id || undefined,
      })

      onSuccess()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  if (!isOpen) return null

  // Determinar qué roles puede crear el usuario actual
  const availableRoles = currentUser?.role === 'owner' 
    ? ['admin', 'manager', 'employee']
    : currentUser?.role === 'admin'
    ? ['manager', 'employee']
    : ['employee'] // manager

  // Filtrar sucursales activas
  const activeBranches = branches.filter(b => b.is_active)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Invitar Usuario</h2>
            <p className="text-sm text-gray-600 mt-1">
              Crea una cuenta para un nuevo miembro del equipo
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email *
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="usuario@ejemplo.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
              autoFocus
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Contraseña *
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Mínimo 6 caracteres"
                className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              💡 Asigna una contraseña que el usuario pueda cambiar después
            </p>
          </div>

          {/* Full Name */}
          <div>
            <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-2">
              Nombre Completo *
            </label>
            <input
              type="text"
              id="full_name"
              name="full_name"
              value={formData.full_name}
              onChange={handleChange}
              placeholder="Ej: Juan Pérez"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
            />
          </div>

          {/* Role */}
          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-2">
              Rol *
            </label>
            <select
              id="role"
              name="role"
              value={formData.role}
              onChange={handleChange}
              disabled={currentUser?.role === 'manager'}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-gray-100"
              required
            >
              {availableRoles.includes('admin') && (
                <option value="admin">Administrador - Acceso completo</option>
              )}
              {availableRoles.includes('manager') && (
                <option value="manager">Manager - Gestiona una sucursal</option>
              )}
              <option value="employee">Empleado - Operaciones básicas</option>
            </select>
          </div>

          {/* Branch */}
          {(formData.role === 'manager' || formData.role === 'employee') && (
            <div>
              <label htmlFor="branch_id" className="block text-sm font-medium text-gray-700 mb-2">
                Sucursal Asignada *
              </label>
              <select
                id="branch_id"
                name="branch_id"
                value={formData.branch_id}
                onChange={handleChange}
                disabled={currentUser?.role === 'manager'}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-gray-100"
                required
              >
                <option value="">Selecciona una sucursal</option>
                {activeBranches.map(branch => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
            <p className="text-blue-900 font-medium mb-2">📋 Información importante:</p>
            <ul className="text-blue-700 space-y-1 text-xs">
              <li>• El usuario podrá iniciar sesión con el email y contraseña que asignaste</li>
              <li>• Comparte las credenciales de forma segura con el usuario</li>
              <li>• El usuario puede cambiar su contraseña después del primer login</li>
              <li>• Los permisos se aplican inmediatamente</li>
            </ul>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading}
            >
              {loading ? 'Invitando...' : 'Invitar Usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
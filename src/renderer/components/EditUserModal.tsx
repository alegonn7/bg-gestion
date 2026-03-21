import { useState, useEffect } from 'react'
import { X, Trash2 } from 'lucide-react'
import { useUsersStore, User } from '@/store/users'
import { useAuthStore } from '@/store/auth'
import { useBranchesStore } from '@/store/branches'

interface EditUserModalProps {
  user: User | null
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function EditUserModal({ user, isOpen, onClose, onSuccess }: EditUserModalProps) {
  const { updateUser, deleteUser } = useUsersStore()
  const { user: currentUser } = useAuthStore()
  const { branches, fetchBranches } = useBranchesStore()
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  
  const [formData, setFormData] = useState({
    full_name: '',
    role: 'employee' as 'admin' | 'manager' | 'employee',
    branch_id: '',
  })

  useEffect(() => {
    if (isOpen && user) {
      fetchBranches()
      
      setFormData({
        full_name: user.full_name || '',
        role: user.role as any,
        branch_id: user.branch_id || '',
      })
      setError('')
      setShowDeleteConfirm(false)
    }
  }, [isOpen, user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!user) return
    
    setError('')
    setLoading(true)

    try {
      if (!formData.full_name.trim()) {
        throw new Error('El nombre completo es obligatorio')
      }

      await updateUser(user.id, {
        full_name: formData.full_name.trim(),
        role: formData.role,
        branch_id: formData.branch_id || null,
      })

      onSuccess()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!user) return
    
    setLoading(true)
    setError('')

    try {
      await deleteUser(user.id)
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message)
      setShowDeleteConfirm(false)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  if (!isOpen || !user) return null

  const availableRoles = currentUser?.role === 'owner' 
    ? ['admin', 'manager', 'employee']
    : currentUser?.role === 'admin'
    ? ['manager', 'employee']
    : ['employee']

  const activeBranches = branches.filter(b => b.is_active)
  const canDelete = currentUser?.role === 'owner'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Editar Usuario</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input
              type="text"
              value={user.email}
              disabled
              className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed"
            />
            <p className="text-xs text-gray-500 mt-1">El email no se puede modificar</p>
          </div>

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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
            />
          </div>

          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-2">
              Rol *
            </label>
            <select
              id="role"
              name="role"
              value={formData.role}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
            >
              {user.role === 'owner' && <option value="owner">Dueño</option>}
              {availableRoles.includes('admin') && <option value="admin">Administrador</option>}
              {availableRoles.includes('manager') && <option value="manager">Manager</option>}
              <option value="employee">Empleado</option>
            </select>
          </div>

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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
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

          {canDelete && showDeleteConfirm ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700 font-medium mb-3">
                ⚠️ ¿Estás seguro que quieres eliminar este usuario?
              </p>
              <p className="text-sm text-red-600 mb-4">
                Esta acción eliminará la cuenta completamente y no se puede deshacer.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 text-sm rounded-lg transition"
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition disabled:opacity-50"
                  disabled={loading}
                >
                  {loading ? 'Eliminando...' : 'Eliminar Definitivamente'}
                </button>
              </div>
            </div>
          ) : canDelete && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition"
            >
              <Trash2 className="w-4 h-4" />
              Eliminar Usuario
            </button>
          )}

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
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
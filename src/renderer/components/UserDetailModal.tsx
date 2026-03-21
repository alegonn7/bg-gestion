import { X, Mail, Shield, Building2, Calendar, User as UserIcon } from 'lucide-react'
import { User } from '@/store/users'

interface UserDetailModalProps {
  user: User | null
  isOpen: boolean
  onClose: () => void
}

export default function UserDetailModal({ user, isOpen, onClose }: UserDetailModalProps) {
  if (!isOpen || !user) return null

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('es-AR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner': return 'Dueño'
      case 'admin': return 'Administrador'
      case 'manager': return 'Manager'
      case 'employee': return 'Empleado'
    }
  }

  const getRoleDescription = (role: string) => {
    switch (role) {
      case 'owner': return 'Acceso completo a toda la organización'
      case 'admin': return 'Gestión de sucursales, usuarios y productos'
      case 'manager': return 'Gestión de una sucursal específica'
      case 'employee': return 'Operaciones básicas de inventario'
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-blue-100 rounded-lg flex items-center justify-center">
              <UserIcon className="w-7 h-7 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {user.full_name || 'Sin nombre'}
              </h2>
              <p className="text-gray-600">{user.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-blue-600 mb-2">
                <Shield className="w-5 h-5" />
                <span className="text-sm font-medium">Rol</span>
              </div>
              <p className="text-lg font-bold text-blue-900">{getRoleLabel(user.role)}</p>
              <p className="text-xs text-blue-700 mt-1">{getRoleDescription(user.role)}</p>
            </div>

            <div className={`rounded-lg p-4 ${user.is_active ? 'bg-green-50' : 'bg-gray-50'}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-sm font-medium ${user.is_active ? 'text-green-600' : 'text-gray-600'}`}>
                  Estado
                </span>
              </div>
              <p className={`text-lg font-bold ${user.is_active ? 'text-green-900' : 'text-gray-900'}`}>
                {user.is_active ? 'Activo' : 'Inactivo'}
              </p>
              <p className={`text-xs mt-1 ${user.is_active ? 'text-green-700' : 'text-gray-600'}`}>
                {user.is_active ? 'Puede acceder al sistema' : 'Sin acceso al sistema'}
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Información</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <Mail className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Email</p>
                  <p className="text-gray-900">{user.email}</p>
                </div>
              </div>

              {user.branch && (
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <Building2 className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Sucursal Asignada</p>
                    <p className="text-gray-900">{user.branch.name}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Fechas</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 text-gray-600 mb-1">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm font-medium">Creado</span>
                </div>
                <p className="text-gray-900 text-sm">{formatDate(user.created_at)}</p>
              </div>

              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 text-gray-600 mb-1">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm font-medium">Última Actualización</span>
                </div>
                <p className="text-gray-900 text-sm">{formatDate(user.updated_at)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
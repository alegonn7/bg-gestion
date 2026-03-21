import { X, Building2, Package, Users, TrendingUp, MapPin, Phone, Mail, Calendar } from 'lucide-react'
import { Branch } from '@/store/branches'

interface BranchDetailModalProps {
  branch: Branch | null
  isOpen: boolean
  onClose: () => void
}

export default function BranchDetailModal({ branch, isOpen, onClose }: BranchDetailModalProps) {
  if (!isOpen || !branch) return null

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('es-AR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-lg flex items-center justify-center ${
              branch.is_active ? 'bg-blue-100' : 'bg-gray-100'
            }`}>
              <Building2 className={`w-7 h-7 ${
                branch.is_active ? 'text-blue-600' : 'text-gray-400'
              }`} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{branch.name}</h2>
              <span className={`inline-block px-3 py-1 text-sm font-medium rounded mt-2 ${
                branch.is_active 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {branch.is_active ? '✓ Activa' : '○ Inactiva'}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-3 gap-4 p-6 bg-gray-50">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-purple-600 mb-2">
              <Package className="w-5 h-5" />
              <span className="text-sm font-medium">Productos</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{branch.products_count || 0}</p>
            <p className="text-xs text-gray-500 mt-1">productos activos</p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-green-600 mb-2">
              <TrendingUp className="w-5 h-5" />
              <span className="text-sm font-medium">Stock Total</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{branch.total_stock || 0}</p>
            <p className="text-xs text-gray-500 mt-1">unidades en inventario</p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-blue-600 mb-2">
              <Users className="w-5 h-5" />
              <span className="text-sm font-medium">Empleados</span>
            </div>
            <p className="text-3xl font-bold text-gray-900">{branch.users_count || 0}</p>
            <p className="text-xs text-gray-500 mt-1">usuarios asignados</p>
          </div>
        </div>

        {/* Information */}
        <div className="p-6 space-y-6">
          {/* Contact Info */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Información de Contacto</h3>
            <div className="space-y-3">
              {branch.address && (
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <MapPin className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Dirección</p>
                    <p className="text-gray-900">{branch.address}</p>
                  </div>
                </div>
              )}

              {branch.phone && (
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <Phone className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Teléfono</p>
                    <p className="text-gray-900">{branch.phone}</p>
                  </div>
                </div>
              )}

              {branch.email && (
                <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <Mail className="w-5 h-5 text-gray-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Email</p>
                    <p className="text-gray-900">{branch.email}</p>
                  </div>
                </div>
              )}

              {!branch.address && !branch.phone && !branch.email && (
                <div className="text-center py-8 text-gray-500">
                  <p>No hay información de contacto registrada</p>
                </div>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Información del Sistema</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 text-gray-600 mb-1">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm font-medium">Fecha de Creación</span>
                </div>
                <p className="text-gray-900 text-sm">{formatDate(branch.created_at)}</p>
              </div>

              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 text-gray-600 mb-1">
                  <Calendar className="w-4 h-4" />
                  <span className="text-sm font-medium">Última Actualización</span>
                </div>
                <p className="text-gray-900 text-sm">{formatDate(branch.updated_at)}</p>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-900 mb-2">Resumen Rápido</h4>
            <ul className="space-y-1 text-sm text-blue-700">
              <li>
                • {branch.products_count || 0} productos con un total de {branch.total_stock || 0} unidades en stock
              </li>
              <li>
                • {branch.users_count || 0} empleados asignados a esta sucursal
              </li>
              <li>
                • Estado: {branch.is_active ? 'Operativa y activa' : 'Desactivada temporalmente'}
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
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
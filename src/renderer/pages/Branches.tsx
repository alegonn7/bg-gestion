import { useEffect, useState } from 'react'
import { Search, Building2, Plus, RefreshCw, MapPin, Phone, Mail, Package, Users, TrendingUp } from 'lucide-react'
import { useBranchesStore, Branch } from '@/store/branches'
import CreateBranchModal from '@/components/CreateBranchModal'
import EditBranchModal from '@/components/EditBranchModal'
import BranchDetailModal from '@/components/BranchDetailModal'

export default function Branches() {
  const { 
    branches, 
    isLoading, 
    error, 
    searchQuery, 
    fetchBranches, 
    setSearchQuery, 
    toggleBranchStatus,
    getFilteredBranches 
  } = useBranchesStore()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [detailingBranch, setDetailingBranch] = useState<Branch | null>(null)

  const filteredBranches = getFilteredBranches()
  const activeBranches = branches.filter(b => b.is_active)

  useEffect(() => {
    fetchBranches()
  }, [])

  const handleRefresh = () => {
    fetchBranches()
  }

  const handleToggleStatus = async (branch: Branch) => {
    try {
      await toggleBranchStatus(branch.id)
    } catch (error: any) {
      alert(error.message)
    }
  }

  const handleCreateSuccess = () => {
    setShowCreateModal(false)
    fetchBranches()
  }

  const handleEditSuccess = () => {
    setEditingBranch(null)
    fetchBranches()
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Building2 className="w-7 h-7 text-blue-600" />
              Sucursales
            </h1>
            <p className="text-gray-600 mt-1">
              Gestiona las ubicaciones de tu negocio
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
              Nueva Sucursal
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar por nombre, dirección, teléfono o email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mt-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <Building2 className="w-4 h-4" />
              <span className="text-sm font-medium">Total Sucursales</span>
            </div>
            <p className="text-2xl font-bold text-blue-900">{branches.length}</p>
          </div>

          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-sm font-medium">Activas</span>
            </div>
            <p className="text-2xl font-bold text-green-900">{activeBranches.length}</p>
          </div>

          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-purple-600 mb-1">
              <Package className="w-4 h-4" />
              <span className="text-sm font-medium">Total Productos</span>
            </div>
            <p className="text-2xl font-bold text-purple-900">
              {branches.reduce((sum, b) => sum + (b.products_count || 0), 0)}
            </p>
          </div>

          <div className="bg-orange-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-orange-600 mb-1">
              <Users className="w-4 h-4" />
              <span className="text-sm font-medium">Total Empleados</span>
            </div>
            <p className="text-2xl font-bold text-orange-900">
              {branches.reduce((sum, b) => sum + (b.users_count || 0), 0)}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
              <p className="text-gray-600">Cargando sucursales...</p>
            </div>
          </div>
        ) : filteredBranches.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Building2 className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchQuery ? 'No se encontraron sucursales' : 'No hay sucursales'}
              </h3>
              <p className="text-gray-600 mb-4">
                {searchQuery 
                  ? 'Intenta con otro término de búsqueda'
                  : 'Crea tu primera sucursal para comenzar'
                }
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                >
                  <Plus className="w-4 h-4" />
                  Nueva Sucursal
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBranches.map((branch) => (
              <BranchCard
                key={branch.id}
                branch={branch}
                onEdit={() => setEditingBranch(branch)}
                onDetail={() => setDetailingBranch(branch)}
                onToggleStatus={() => handleToggleStatus(branch)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateBranchModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
      />

      <EditBranchModal
        branch={editingBranch}
        isOpen={!!editingBranch}
        onClose={() => setEditingBranch(null)}
        onSuccess={handleEditSuccess}
      />

      <BranchDetailModal
        branch={detailingBranch}
        isOpen={!!detailingBranch}
        onClose={() => setDetailingBranch(null)}
      />
    </div>
  )
}

// Branch Card Component
interface BranchCardProps {
  branch: Branch
  onEdit: () => void
  onDetail: () => void
  onToggleStatus: () => void
}

function BranchCard({ branch, onEdit, onDetail, onToggleStatus }: BranchCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              branch.is_active ? 'bg-blue-100' : 'bg-gray-100'
            }`}>
              <Building2 className={`w-5 h-5 ${
                branch.is_active ? 'text-blue-600' : 'text-gray-400'
              }`} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">
                {branch.name}
              </h3>
              <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded mt-1 ${
                branch.is_active 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {branch.is_active ? 'Activa' : 'Inactiva'}
              </span>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="space-y-1 text-sm text-gray-600">
          {branch.address && (
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span className="line-clamp-2">{branch.address}</span>
            </div>
          )}
          {branch.phone && (
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              <span>{branch.phone}</span>
            </div>
          )}
          {branch.email && (
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              <span className="truncate">{branch.email}</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="p-4 bg-gray-50">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-gray-500 mb-1">Productos</p>
            <p className="text-lg font-bold text-gray-900">{branch.products_count || 0}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Stock</p>
            <p className="text-lg font-bold text-gray-900">{branch.total_stock || 0}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Usuarios</p>
            <p className="text-lg font-bold text-gray-900">{branch.users_count || 0}</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="p-3 border-t border-gray-200 flex gap-2">
        <button
          onClick={onDetail}
          className="flex-1 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium rounded-lg transition"
        >
          Ver Detalle
        </button>
        <button
          onClick={onEdit}
          className="flex-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition"
        >
          Editar
        </button>
        <button
          onClick={onToggleStatus}
          className={`px-3 py-2 text-sm font-medium rounded-lg transition ${
            branch.is_active
              ? 'bg-red-50 hover:bg-red-100 text-red-700'
              : 'bg-green-50 hover:bg-green-100 text-green-700'
          }`}
        >
          {branch.is_active ? 'Desactivar' : 'Activar'}
        </button>
      </div>
    </div>
  )
}
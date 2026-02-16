import { useEffect, useState } from 'react'
import { Search, Users as UsersIcon, RefreshCw, UserPlus, Shield, UserCog, User as UserIcon } from 'lucide-react'
import { useUsersStore, User } from '@/store/users'
import { useAuthStore } from '@/store/auth'
import InviteUserModal from '@/components/InviteUserModal'
import EditUserModal from '@/components/EditUserModal'
import UserDetailModal from '@/components/UserDetailModal'

export default function Users() {
  const { 
    users, 
    isLoading, 
    error, 
    searchQuery, 
    fetchUsers, 
    setSearchQuery, 
    toggleUserStatus,
    getFilteredUsers 
  } = useUsersStore()

  const { user: currentUser } = useAuthStore()

  const [showInviteModal, setShowInviteModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [detailingUser, setDetailingUser] = useState<User | null>(null)

  const filteredUsers = getFilteredUsers()

  // Agrupar por rol
  const usersByRole = {
    owner: users.filter(u => u.role === 'owner'),
    admin: users.filter(u => u.role === 'admin'),
    manager: users.filter(u => u.role === 'manager'),
    employee: users.filter(u => u.role === 'employee'),
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const handleRefresh = () => {
    fetchUsers()
  }

  const handleToggleStatus = async (user: User) => {
    try {
      await toggleUserStatus(user.id)
    } catch (error: any) {
      alert(error.message)
    }
  }

  const handleInviteSuccess = () => {
    setShowInviteModal(false)
    fetchUsers()
  }

  const handleEditSuccess = () => {
    setEditingUser(null)
    fetchUsers()
  }

  const canInvite = currentUser?.role !== 'employee'

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <UsersIcon className="w-7 h-7 text-blue-600" />
              Usuarios y Empleados
            </h1>
            <p className="text-gray-600 mt-1">
              Gestiona el equipo de tu organización
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

            {canInvite && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
              >
                <UserPlus className="w-4 h-4" />
                Invitar Usuario
              </button>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar por nombre, email, rol o sucursal..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-5 gap-4 mt-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <UsersIcon className="w-4 h-4" />
              <span className="text-sm font-medium">Total</span>
            </div>
            <p className="text-2xl font-bold text-blue-900">{users.length}</p>
          </div>

          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <Shield className="w-4 h-4" />
              <span className="text-sm font-medium">Owners</span>
            </div>
            <p className="text-2xl font-bold text-green-900">{usersByRole.owner.length}</p>
          </div>

          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-purple-600 mb-1">
              <UserCog className="w-4 h-4" />
              <span className="text-sm font-medium">Admins</span>
            </div>
            <p className="text-2xl font-bold text-purple-900">{usersByRole.admin.length}</p>
          </div>

          <div className="bg-orange-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-orange-600 mb-1">
              <UserCog className="w-4 h-4" />
              <span className="text-sm font-medium">Managers</span>
            </div>
            <p className="text-2xl font-bold text-orange-900">{usersByRole.manager.length}</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-gray-600 mb-1">
              <UserIcon className="w-4 h-4" />
              <span className="text-sm font-medium">Empleados</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{usersByRole.employee.length}</p>
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
              <p className="text-gray-600">Cargando usuarios...</p>
            </div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <UsersIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchQuery ? 'No se encontraron usuarios' : 'No hay usuarios'}
              </h3>
              <p className="text-gray-600 mb-4">
                {searchQuery 
                  ? 'Intenta con otro término de búsqueda'
                  : 'Invita a tu equipo para comenzar a trabajar juntos'
                }
              </p>
              {!searchQuery && canInvite && (
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                >
                  <UserPlus className="w-4 h-4" />
                  Invitar Usuario
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUsers.map((user) => (
              <UserCard
                key={user.id}
                user={user}
                currentUser={currentUser!}
                onEdit={() => setEditingUser(user)}
                onDetail={() => setDetailingUser(user)}
                onToggleStatus={() => handleToggleStatus(user)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <InviteUserModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        onSuccess={handleInviteSuccess}
      />

      <EditUserModal
        user={editingUser}
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        onSuccess={handleEditSuccess}
      />

      <UserDetailModal
        user={detailingUser}
        isOpen={!!detailingUser}
        onClose={() => setDetailingUser(null)}
      />
    </div>
  )
}

// User Card Component
interface UserCardProps {
  user: User
  currentUser: Omit<User, 'created_at' | 'updated_at'>
  onEdit: () => void
  onDetail: () => void
  onToggleStatus: () => void
}

function UserCard({ user, currentUser, onEdit, onDetail, onToggleStatus }: UserCardProps) {
  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner': return <Shield className="w-5 h-5 text-green-600" />
      case 'admin': return <UserCog className="w-5 h-5 text-purple-600" />
      case 'manager': return <UserCog className="w-5 h-5 text-orange-600" />
      case 'employee': return <UserIcon className="w-5 h-5 text-gray-600" />
    }
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-green-100 text-green-700'
      case 'admin': return 'bg-purple-100 text-purple-700'
      case 'manager': return 'bg-orange-100 text-orange-700'
      case 'employee': return 'bg-gray-100 text-gray-700'
    }
  }

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner': return 'Dueño'
      case 'admin': return 'Administrador'
      case 'manager': return 'Manager'
      case 'employee': return 'Empleado'
    }
  }

  const isCurrentUser = user.id === currentUser.id
  const canEdit = currentUser.role === 'owner' || 
                  (currentUser.role === 'admin' && user.role !== 'owner') ||
                  (currentUser.role === 'manager' && user.role === 'employee' && user.branch_id === currentUser.branch_id)

  return (
    <div className="bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              user.is_active ? 'bg-blue-100' : 'bg-gray-100'
            }`}>
              {getRoleIcon(user.role)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">
                {user.full_name || 'Sin nombre'}
                {isCurrentUser && <span className="text-blue-600 ml-1">(tú)</span>}
              </h3>
              <p className="text-sm text-gray-500 truncate">{user.email}</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${getRoleBadge(user.role)}`}>
            {getRoleLabel(user.role)}
          </span>
          <span className={`inline-block px-2 py-1 text-xs font-medium rounded ${
            user.is_active 
              ? 'bg-green-100 text-green-700' 
              : 'bg-gray-100 text-gray-600'
          }`}>
            {user.is_active ? 'Activo' : 'Inactivo'}
          </span>
        </div>
      </div>

      {/* Branch Info */}
      <div className="p-4 bg-gray-50">
        {user.branch ? (
          <div>
            <p className="text-xs text-gray-500 mb-1">Sucursal Asignada</p>
            <p className="text-sm font-medium text-gray-900">{user.branch.name}</p>
          </div>
        ) : (
          <div>
            <p className="text-xs text-gray-500 mb-1">Sucursal</p>
            <p className="text-sm text-gray-600">Sin asignar</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-3 border-t border-gray-200 flex gap-2">
        <button
          onClick={onDetail}
          className="flex-1 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium rounded-lg transition"
        >
          Ver Detalle
        </button>
        {canEdit && !isCurrentUser && (
          <>
            <button
              onClick={onEdit}
              className="flex-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition"
            >
              Editar
            </button>
            <button
              onClick={onToggleStatus}
              className={`px-3 py-2 text-sm font-medium rounded-lg transition ${
                user.is_active
                  ? 'bg-red-50 hover:bg-red-100 text-red-700'
                  : 'bg-green-50 hover:bg-green-100 text-green-700'
              }`}
            >
              {user.is_active ? 'Desactivar' : 'Activar'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
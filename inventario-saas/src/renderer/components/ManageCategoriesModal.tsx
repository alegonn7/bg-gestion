import { useState, useEffect } from 'react'
import { X, Plus, Edit2, Trash2, Tag, Package } from 'lucide-react'
import { useCategoriesStore, Category } from '@/store/categories'

interface ManageCategoriesModalProps {
  isOpen: boolean
  onClose: () => void
}

const PRESET_COLORS = [
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
  '#84CC16', // lime
  '#6366F1', // indigo
]

export default function ManageCategoriesModal({ isOpen, onClose }: ManageCategoriesModalProps) {
  const { categories, isLoading, fetchCategories, createCategory, updateCategory, deleteCategory } = useCategoriesStore()
  
  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list')
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  const [formData, setFormData] = useState({
    name: '',
    color: PRESET_COLORS[0],
  })

  useEffect(() => {
    if (isOpen) {
      fetchCategories()
      setMode('list')
      setError('')
    }
  }, [isOpen])

  const handleCreate = () => {
    setMode('create')
    setFormData({
      name: '',
      color: PRESET_COLORS[0],
    })
    setError('')
  }

  const handleEdit = (category: Category) => {
    setEditingCategory(category)
    setFormData({
      name: category.name,
      color: category.color,
    })
    setMode('edit')
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    setError('')
    setLoading(true)

    try {
      if (!formData.name.trim()) {
        throw new Error('El nombre es obligatorio')
      }

      if (mode === 'create') {
        await createCategory({
          name: formData.name.trim(),
          color: formData.color,
          is_active: true
        })
      } else if (mode === 'edit' && editingCategory) {
        await updateCategory(editingCategory.id, {
          name: formData.name.trim(),
          color: formData.color,
        })
      }

      setMode('list')
      setEditingCategory(null)
      await fetchCategories()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (category: Category) => {
    const confirm = window.confirm(
      `¿Estás seguro que quieres eliminar la categoría "${category.name}"?`
    )
    
    if (!confirm) return

    setLoading(true)
    setError('')

    try {
      await deleteCategory(category.id)
      await fetchCategories()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setMode('list')
    setEditingCategory(null)
    setError('')
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Tag className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {mode === 'list' ? 'Gestionar Categorías' : mode === 'create' ? 'Nueva Categoría' : 'Editar Categoría'}
              </h2>
              <p className="text-sm text-gray-600">
                {mode === 'list' ? 'Organiza tus productos por categorías' : 'Completa la información'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}

          {/* List Mode */}
          {mode === 'list' && (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-600">
                  {categories.length} categorías creadas
                </p>
                <button
                  onClick={handleCreate}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Nueva Categoría
                </button>
              </div>

              {isLoading ? (
                <div className="text-center py-8 text-gray-500">
                  Cargando categorías...
                </div>
              ) : categories.length === 0 ? (
                <div className="text-center py-12">
                  <Tag className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No hay categorías
                  </h3>
                  <p className="text-gray-600 mb-4">
                    Crea tu primera categoría para organizar productos
                  </p>
                  <button
                    onClick={handleCreate}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition"
                  >
                    <Plus className="w-4 h-4" />
                    Crear Categoría
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {categories.map((category) => (
                    <div
                      key={category.id}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-purple-300 transition"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: category.color + '20' }}
                        >
                          <Tag className="w-5 h-5" style={{ color: category.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 truncate">
                            {category.name}
                          </h3>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <Package className="w-3 h-3" />
                            <span>{category.products_count || 0} productos</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEdit(category)}
                          className="p-2 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(category)}
                          className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                          title="Eliminar"
                          disabled={loading}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Create/Edit Mode */}
          {(mode === 'create' || mode === 'edit') && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre de la Categoría *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ej: Bebidas, Snacks, Limpieza..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                  required
                  autoFocus
                />
              </div>

              {/* Color */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Color *
                </label>
                <div className="grid grid-cols-10 gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, color }))}
                      className={`w-10 h-10 rounded-lg transition ${
                        formData.color === color 
                          ? 'ring-2 ring-purple-500 ring-offset-2' 
                          : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Selecciona un color para identificar esta categoría
                </p>
              </div>

              {/* Preview */}
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-600 mb-2">Vista previa:</p>
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: formData.color + '20' }}
                  >
                    <Tag className="w-5 h-5" style={{ color: formData.color }} />
                  </div>
                  <span className="font-medium text-gray-900">
                    {formData.name || 'Nombre de la categoría'}
                  </span>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition"
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={loading}
                >
                  {loading ? 'Guardando...' : mode === 'create' ? 'Crear Categoría' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        {mode === 'list' && (
          <div className="p-6 border-t border-gray-200 bg-gray-50">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
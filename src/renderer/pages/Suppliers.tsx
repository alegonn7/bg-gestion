import { useEffect, useState } from 'react'
import { Search, Truck, Plus, RefreshCw, Mail, Phone, MapPin, Package, Download, X, Edit2, Trash2 } from 'lucide-react'
import { useSuppliersStore } from '@/store/suppliers'
import { useProductsStore } from '@/store/products'
import SupplierProductsModal from '@/components/SupplierProductsModal'

const EMPTY_FORM = { name: '', email: '', phone: '', address: '', notes: '' }

export default function SuppliersPage() {
  const { suppliers, isLoading, error, fetchSuppliers, addSupplier, updateSupplier, deleteSupplier } = useSuppliersStore()
  const { products, fetchProducts } = useProductsStore()

  const [modalOpen, setModalOpen] = useState(false)
  const [modalSupplier, setModalSupplier] = useState<{ id: string; name: string } | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [searchQuery, setSearchQuery] = useState('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => { fetchSuppliers(); fetchProducts() }, [])

  const filtered = suppliers.filter(s =>
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleEdit = (supplier: any) => {
    setEditing(supplier.id)
    setForm({
      name: supplier.name || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      notes: supplier.notes || '',
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditing(null)
    setForm(EMPTY_FORM)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    if (editing) {
      await updateSupplier(editing, form)
    } else {
      await addSupplier(form)
    }
    handleCancel()
  }

  const handleExport = () => {
    setExporting(true)
    const rows = suppliers.map(s => {
      const suppliedProducts = products.filter(p => p.product && p.product.supplier_id === s.id)
      return {
        Nombre: s.name,
        Email: s.email,
        Teléfono: s.phone,
        Dirección: s.address,
        Notas: s.notes,
        Productos: suppliedProducts.map(p => p.product?.name).join('; '),
      }
    })
    const csv = [
      Object.keys(rows[0]).join(','),
      ...rows.map(r => Object.values(r).map(v => `"${v || ''}"`).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'proveedores.csv'
    a.click()
    setExporting(false)
  }

  const suppliersWithProducts = suppliers.filter(s =>
    products.some(p => p.product && p.product.supplier_id === s.id)
  )

  return (
    <div className="h-full flex flex-col bg-gray-50">

      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Truck className="w-7 h-7 text-blue-600" />
              Proveedores
            </h1>
            <p className="text-gray-600 mt-1">Gestioná tus proveedores y los productos asociados</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={fetchSuppliers}
              disabled={isLoading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
            <button
              onClick={handleExport}
              disabled={exporting || suppliers.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Exportar CSV
            </button>
            <button
              onClick={() => { handleCancel(); setShowForm(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
            >
              <Plus className="w-4 h-4" />
              Nuevo Proveedor
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar proveedor por nombre..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-blue-600 mb-1">
              <Truck className="w-4 h-4" />
              <span className="text-sm font-medium">Total Proveedores</span>
            </div>
            <p className="text-2xl font-bold text-blue-900">{suppliers.length}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <Package className="w-4 h-4" />
              <span className="text-sm font-medium">Con Productos</span>
            </div>
            <p className="text-2xl font-bold text-green-900">{suppliersWithProducts.length}</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-purple-600 mb-1">
              <Package className="w-4 h-4" />
              <span className="text-sm font-medium">Total Productos</span>
            </div>
            <p className="text-2xl font-bold text-purple-900">
              {products.filter(p => p.product?.supplier_id).length}
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

        {/* Form */}
        {showForm && (
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Truck className="w-5 h-5 text-blue-600" />
                {editing ? 'Editar Proveedor' : 'Nuevo Proveedor'}
              </h2>
              <button onClick={handleCancel} className="p-1 hover:bg-gray-100 rounded-lg transition">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    required
                    placeholder="Nombre del proveedor"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="email@proveedor.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="+54 11 0000-0000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    value={form.address}
                    onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    placeholder="Dirección del proveedor"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                  <textarea
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Notas adicionales..."
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
                >
                  {editing ? 'Guardar cambios' : 'Crear proveedor'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Loading */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
              <p className="text-gray-600">Cargando proveedores...</p>
            </div>
          </div>

        /* Empty state */
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Truck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchQuery ? 'No se encontraron proveedores' : 'No hay proveedores'}
              </h3>
              <p className="text-gray-500 mb-4">
                {searchQuery
                  ? 'Intentá con otro término de búsqueda'
                  : 'Agregá tu primer proveedor para comenzar'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => { handleCancel(); setShowForm(true) }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
                >
                  <Plus className="w-4 h-4" />
                  Nuevo Proveedor
                </button>
              )}
            </div>
          </div>

        /* Cards */
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(s => {
              const suppliedProducts = products.filter(p => p.product && p.product.supplier_id === s.id)
              return (
                <div
                  key={s.id}
                  className="bg-white rounded-lg border border-gray-200 hover:border-blue-300 hover:shadow-md transition flex flex-col"
                >
                  {/* Card header */}
                  <div className="p-4 border-b border-gray-100">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <Truck className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">{s.name}</h3>
                        <span className="inline-block px-2 py-0.5 text-xs font-medium rounded mt-1 bg-green-100 text-green-700">
                          Activo
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Contact info */}
                  <div className="p-4 space-y-1.5 text-sm text-gray-600 flex-1">
                    {s.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 flex-shrink-0 text-gray-400" />
                        <span className="truncate">{s.email}</span>
                      </div>
                    )}
                    {s.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 flex-shrink-0 text-gray-400" />
                        <span>{s.phone}</span>
                      </div>
                    )}
                    {s.address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 flex-shrink-0 text-gray-400 mt-0.5" />
                        <span className="line-clamp-2">{s.address}</span>
                      </div>
                    )}
                    {s.notes && (
                      <p className="text-gray-400 text-xs line-clamp-2 pt-1 italic">{s.notes}</p>
                    )}
                    {!s.email && !s.phone && !s.address && !s.notes && (
                      <p className="text-gray-400 text-xs italic">Sin información de contacto</p>
                    )}
                  </div>

                  {/* Products count */}
                  <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                    <button
                      className={`w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        suppliedProducts.length > 0
                          ? 'bg-blue-50 hover:bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-400 cursor-default'
                      }`}
                      onClick={() => {
                        if (suppliedProducts.length > 0) {
                          setModalSupplier({ id: s.id, name: s.name })
                          setModalOpen(true)
                        }
                      }}
                      disabled={suppliedProducts.length === 0}
                    >
                      <Package className="w-4 h-4" />
                      {suppliedProducts.length > 0
                        ? `Ver ${suppliedProducts.length} producto${suppliedProducts.length !== 1 ? 's' : ''}`
                        : 'Sin productos'}
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="p-3 border-t border-gray-200 flex gap-2">
                    <button
                      onClick={() => handleEdit(s)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Editar
                    </button>
                    <button
                      onClick={() => deleteSupplier(s.id)}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-medium rounded-lg transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Eliminar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal productos */}
      {modalOpen && modalSupplier && (
        <SupplierProductsModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          supplierName={modalSupplier.name}
          products={products.filter(p => p.product && p.product.supplier_id === modalSupplier.id)}
        />
      )}
    </div>
  )
}

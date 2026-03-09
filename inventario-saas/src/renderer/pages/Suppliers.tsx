import { useEffect, useState } from 'react'
import { useSuppliersStore } from '@/store/suppliers'
import { useProductsStore } from '@/store/products'
import SupplierProductsModal from '@/components/SupplierProductsModal'

export default function SuppliersPage() {
  const { suppliers, isLoading, error, fetchSuppliers, addSupplier, updateSupplier, deleteSupplier } = useSuppliersStore()
  const { products, fetchProducts } = useProductsStore()
  const [exporting, setExporting] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalSupplier, setModalSupplier] = useState<{ id: string, name: string } | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null as null | string)
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', notes: '' })

  useEffect(() => { fetchSuppliers(); fetchProducts(); }, [])

  const handleEdit = (supplier: any) => {
    setEditing(supplier.id)
    setForm({
      name: supplier.name || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      notes: supplier.notes || ''
    })
    setShowForm(true)
  }

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    if (!form.name.trim()) return
    if (editing) {
      await updateSupplier(editing, form)
    } else {
      await addSupplier(form)
    }
    setShowForm(false)
    setEditing(null)
    setForm({ name: '', email: '', phone: '', address: '', notes: '' })
  }

  // Exportar proveedores a CSV
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
        Productos: suppliedProducts.map(p => p.product?.name).join('; ')
      }
    })
    const csv = [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).map(v => '"' + (v || '') + '"').join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'proveedores.csv'
    a.click()
    setExporting(false)
  }
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Proveedores</h1>
        <div className="flex gap-2">
          <button onClick={handleExport} disabled={exporting || suppliers.length === 0} className="px-4 py-2 bg-green-600 text-white rounded-lg">Exportar CSV</button>
          <button onClick={() => { setShowForm(true); setEditing(null); setForm({ name: '', email: '', phone: '', address: '', notes: '' }) }} className="px-4 py-2 bg-blue-600 text-white rounded-lg">Nuevo</button>
        </div>
      </div>
      {error && <div className="mb-4 text-red-600">{error}</div>}
      {isLoading ? (
        <div>Cargando...</div>
      ) : (
        <table className="w-full mb-8 border">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 text-left">Nombre</th>
              <th className="p-2 text-left">Email</th>
              <th className="p-2 text-left">Teléfono</th>
              <th className="p-2 text-left">Dirección</th>
              <th className="p-2 text-left">Notas</th>
              <th className="p-2 text-left">Productos</th>
              <th className="p-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map(s => {
              const suppliedProducts = products.filter(p => p.product && p.product.supplier_id === s.id)
              return (
                <tr key={s.id} className="border-t">
                  <td className="p-2">{s.name}</td>
                  <td className="p-2">{s.email}</td>
                  <td className="p-2">{s.phone}</td>
                  <td className="p-2">{s.address}</td>
                  <td className="p-2">{s.notes}</td>
                  <td className="p-2">
                    <button
                      className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm"
                      onClick={() => { setModalSupplier({ id: s.id, name: s.name }); setModalOpen(true); }}
                      disabled={suppliedProducts.length === 0}
                    >
                      Ver productos ({suppliedProducts.length})
                    </button>
                  </td>
                  <td className="p-2 flex gap-2">
                    <button onClick={() => handleEdit(s)} className="px-2 py-1 bg-yellow-200 rounded">Editar</button>
                    <button onClick={() => deleteSupplier(s.id)} className="px-2 py-1 bg-red-200 rounded">Eliminar</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      {modalOpen && modalSupplier && (
        <SupplierProductsModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          supplierName={modalSupplier.name}
          products={products.filter(p => p.product && p.product.supplier_id === modalSupplier.id)}
        />
      )}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">{editing ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h2>
          <div className="mb-3">
            <label className="block mb-1">Nombre *</label>
            <input className="w-full border rounded px-3 py-2" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="mb-3">
            <label className="block mb-1">Email</label>
            <input className="w-full border rounded px-3 py-2" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div className="mb-3">
            <label className="block mb-1">Teléfono</label>
            <input className="w-full border rounded px-3 py-2" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="mb-3">
            <label className="block mb-1">Dirección</label>
            <input className="w-full border rounded px-3 py-2" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </div>
          <div className="mb-3">
            <label className="block mb-1">Notas</label>
            <textarea className="w-full border rounded px-3 py-2" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex gap-3 mt-4">
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">{editing ? 'Guardar' : 'Crear'}</button>
            <button type="button" onClick={() => { setShowForm(false); setEditing(null); setForm({ name: '', email: '', phone: '', address: '', notes: '' }) }} className="px-4 py-2 bg-gray-200 rounded">Cancelar</button>
          </div>
        </form>
      )}
    </div>
  )
}

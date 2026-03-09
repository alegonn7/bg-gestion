import type { Product } from '@/store/products'

export function exportProductsToCSV(products: Product[], filename = 'productos.csv') {
  if (!products.length) return
  const headers = [
    'Nombre',
    'Código de barras',
    'Categoría',
    'Proveedor',
    'Stock',
    'Precio costo',
    'Precio venta',
    'Precio costo USD',
    'Precio venta USD'
  ]
  const rows = products.map(p => [
    p.product?.name || '',
    p.barcode || '',
    p.category?.name || '',
    p.product?.supplier_id || '',
    p.stock_quantity,
    p.price_cost,
    p.price_sale,
    p.price_cost_usd ?? '',
    p.price_sale_usd ?? ''
  ])
  const csv = [headers.join(','), ...rows.map(r => r.map(v => '"' + v + '"').join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}

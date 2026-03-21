import { supabase } from './supabase'
import { useAuthStore } from '@/store/auth'
import type { Product } from '@/store/products'

// ============================================================
// EXPORTAR PRODUCTOS A CSV
// ============================================================

const CSV_HEADERS = [
  'nombre',
  'codigo_barras',
  'sku',
  'descripcion',
  'categoria',
  'precio_costo',
  'precio_venta',
  'precio_costo_usd',
  'precio_venta_usd',
  'stock',
  'stock_minimo',
]

function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function exportProductsToCSV(products: Product[], branchName?: string): void {
  const rows = products.map(p => [
    escapeCSV(p.product?.name),
    escapeCSV(p.barcode),
    escapeCSV(p.product?.sku),
    escapeCSV(p.product?.description),
    escapeCSV(p.category?.name),
    escapeCSV(p.price_cost),
    escapeCSV(p.price_sale),
    escapeCSV(p.price_cost_usd),
    escapeCSV(p.price_sale_usd),
    escapeCSV(p.stock_quantity),
    escapeCSV(p.stock_min),
  ])

  const csv = [CSV_HEADERS.join(','), ...rows.map(r => r.join(','))].join('\n')

  // BOM para que Excel lea bien los acentos
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)
  const filename = branchName
    ? `productos_${branchName.replace(/\s+/g, '_')}_${date}.csv`
    : `productos_${date}.csv`
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

// ============================================================
// IMPORTAR PRODUCTOS DESDE CSV
// ============================================================

export interface CSVImportRow {
  nombre: string
  codigo_barras: string
  sku: string
  descripcion: string
  categoria: string
  precio_costo: string
  precio_venta: string
  precio_costo_usd: string
  precio_venta_usd: string
  stock: string
  stock_minimo: string
}

export interface ImportResult {
  total: number
  imported: number
  skipped: number
  errors: { row: number; name: string; error: string }[]
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let insideQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        insideQuotes = !insideQuotes
      }
    } else if (char === ',' && !insideQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

export function parseCSV(text: string): CSVImportRow[] {
  // Remover BOM si existe
  const clean = text.replace(/^\uFEFF/, '')
  const lines = clean.split(/\r?\n/).filter(l => l.trim() !== '')

  if (lines.length < 2) return []

  // Leer headers y normalizar
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim())

  const rows: CSVImportRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    const row: any = {}
    headers.forEach((h, idx) => {
      row[h] = values[idx] || ''
    })
    rows.push(row as CSVImportRow)
  }

  return rows
}

export function validateRow(row: CSVImportRow, rowIndex: number): string | null {
  if (!row.nombre || row.nombre.trim() === '') {
    return `Fila ${rowIndex}: Falta el nombre del producto`
  }
  const priceCost = parseFloat(row.precio_costo)
  const priceSale = parseFloat(row.precio_venta)
  if (isNaN(priceCost) || priceCost < 0) {
    return `Fila ${rowIndex}: precio_costo invalido (${row.precio_costo})`
  }
  if (isNaN(priceSale) || priceSale < 0) {
    return `Fila ${rowIndex}: precio_venta invalido (${row.precio_venta})`
  }
  return null
}

export async function importProductsFromCSV(
  rows: CSVImportRow[],
  onProgress?: (current: number, total: number) => void
): Promise<ImportResult> {
  const { user, selectedBranch } = useAuthStore.getState()
  if (!user) throw new Error('No hay usuario autenticado')

  const branchId = user.role === 'owner' || user.role === 'admin'
    ? selectedBranch?.id
    : user.branch_id

  if (!branchId) throw new Error('No hay sucursal seleccionada')

  // Cachear categorías por nombre
  const { data: existingCategories } = await supabase
    .from('categories')
    .select('id, name')
    .eq('organization_id', user.organization_id)
    .eq('is_active', true)

  const categoryMap = new Map<string, string>()
  existingCategories?.forEach(c => categoryMap.set(c.name.toLowerCase(), c.id))

  const result: ImportResult = {
    total: rows.length,
    imported: 0,
    skipped: 0,
    errors: [],
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    onProgress?.(i + 1, rows.length)

    // Validar
    const validationError = validateRow(row, i + 1)
    if (validationError) {
      result.errors.push({ row: i + 1, name: row.nombre || '(sin nombre)', error: validationError })
      result.skipped++
      continue
    }

    try {
      // Buscar o crear categoría
      let categoryId: string | null = null
      if (row.categoria && row.categoria.trim() !== '') {
        const catKey = row.categoria.trim().toLowerCase()
        if (categoryMap.has(catKey)) {
          categoryId = categoryMap.get(catKey)!
        } else {
          // Crear categoría nueva
          const randomColor = '#' + Math.floor(Math.random() * 0xCCCCCC + 0x333333).toString(16).padStart(6, '0')
          const { data: newCat, error: catError } = await supabase
            .from('categories')
            .insert({
              organization_id: user.organization_id,
              name: row.categoria.trim(),
              color: randomColor,
            })
            .select()
            .single()

          if (catError) {
            console.warn('Error creando categoría:', catError)
          } else if (newCat) {
            categoryId = newCat.id
            categoryMap.set(catKey, newCat.id)
          }
        }
      }

      // Buscar producto maestro por barcode si existe
      let masterProduct: any = null
      const barcode = row.codigo_barras?.trim() || null

      if (barcode) {
        const { data } = await supabase
          .from('products')
          .select('*')
          .eq('barcode', barcode)
          .eq('organization_id', user.organization_id)
          .single()
        masterProduct = data
      }

      // Crear producto maestro si no existe
      if (!masterProduct) {
        const { data: newMaster, error: masterError } = await supabase
          .from('products')
          .insert({
            organization_id: user.organization_id,
            barcode: barcode,
            sku: row.sku?.trim() || null,
            name: row.nombre.trim(),
            description: row.descripcion?.trim() || null,
            category_id: categoryId,
            created_by: user.id,
            updated_by: user.id,
          })
          .select()
          .single()

        if (masterError) throw masterError
        masterProduct = newMaster
      }

      // Verificar si ya existe en la sucursal
      const { data: existing } = await supabase
        .from('products_branch')
        .select('id')
        .eq('product_id', masterProduct.id)
        .eq('branch_id', branchId)
        .single()

      if (existing) {
        result.errors.push({
          row: i + 1,
          name: row.nombre,
          error: 'Ya existe en esta sucursal (se omitio)',
        })
        result.skipped++
        continue
      }

      // Crear products_branch
      const priceCostUsd = row.precio_costo_usd ? parseFloat(row.precio_costo_usd) : null
      const priceSaleUsd = row.precio_venta_usd ? parseFloat(row.precio_venta_usd) : null

      const { error: branchError } = await supabase
        .from('products_branch')
        .insert({
          product_id: masterProduct.id,
          branch_id: branchId,
          barcode: barcode,
          price_cost: parseFloat(row.precio_costo),
          price_sale: parseFloat(row.precio_venta),
          price_cost_usd: isNaN(priceCostUsd as number) ? null : priceCostUsd,
          price_sale_usd: isNaN(priceSaleUsd as number) ? null : priceSaleUsd,
          stock_quantity: parseInt(row.stock) || 0,
          stock_min: parseInt(row.stock_minimo) || 0,
          created_by: user.id,
          updated_by: user.id,
        })

      if (branchError) throw branchError

      result.imported++
    } catch (err: any) {
      result.errors.push({
        row: i + 1,
        name: row.nombre || '(sin nombre)',
        error: err.message || 'Error desconocido',
      })
      result.skipped++
    }
  }

  return result
}

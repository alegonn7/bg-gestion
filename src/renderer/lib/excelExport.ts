import * as ExcelJS from 'exceljs'
import type { Product } from '@/store/products'

// ============================================================
// EXPORTAR PRODUCTOS A EXCEL (una hoja por categoría)
// ============================================================

const SIN_CATEGORIA = 'Sin categoría'
const DEFAULT_ACCENT = 'FF2563EB' // azul de la app, para el resumen y categorías sin color propio
const HEADER_BG = 'FF334155'
const HEADER_LIGHT_TEXT = 'FFFFFFFF'
const HEADER_DARK_TEXT = 'FF1F2937'
const SUBTITLE_TEXT = 'FF64748B'
const BORDER_COLOR = 'FFE2E8F0'
const ZEBRA_FILL = 'FFF8FAFC'
const LOW_STOCK_FILL = 'FFFEF2F2'
const LOW_STOCK_TEXT = 'FFB91C1C'
const OK_TEXT = 'FF15803D'

interface ColumnDef {
  header: string
  key: string
  width: number
  numFmt?: string
}

const PRODUCT_COLUMNS: ColumnDef[] = [
  { header: 'Producto', key: 'nombre', width: 36 },
  { header: 'Código de barras', key: 'barcode', width: 18 },
  { header: 'SKU', key: 'sku', width: 14 },
  { header: 'Descripción', key: 'descripcion', width: 34 },
  { header: 'Precio costo', key: 'price_cost', width: 14, numFmt: '"$" #,##0.00' },
  { header: 'Precio venta', key: 'price_sale', width: 14, numFmt: '"$" #,##0.00' },
  { header: 'Costo USD', key: 'price_cost_usd', width: 13, numFmt: '"US$" #,##0.00' },
  { header: 'Venta USD', key: 'price_sale_usd', width: 13, numFmt: '"US$" #,##0.00' },
  { header: 'Stock', key: 'stock', width: 10, numFmt: '#,##0' },
  { header: 'Stock mínimo', key: 'stock_min', width: 12, numFmt: '#,##0' },
  { header: 'Estado', key: 'estado', width: 14 },
]

const SUMMARY_COLUMNS: ColumnDef[] = [
  { header: 'Categoría', key: 'categoria', width: 30 },
  { header: 'Productos', key: 'productos', width: 12, numFmt: '#,##0' },
  { header: 'Stock bajo', key: 'stock_bajo', width: 12, numFmt: '#,##0' },
  { header: 'Unidades en stock', key: 'unidades', width: 17, numFmt: '#,##0' },
  { header: 'Valor costo', key: 'valor_costo', width: 16, numFmt: '"$" #,##0.00' },
  { header: 'Valor venta', key: 'valor_venta', width: 16, numFmt: '"$" #,##0.00' },
  { header: 'Detalle', key: 'link', width: 14 },
]

interface CategoryGroup {
  name: string
  colorArgb: string | null
  products: Product[]
}

function hexToArgb(hex?: string | null): string | null {
  if (!hex) return null
  const clean = hex.replace('#', '').trim()
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null
  return `FF${clean.toUpperCase()}`
}

/** Elige texto claro u oscuro según la luminancia del color de fondo, para que siempre se lea bien */
function contrastText(argb: string): string {
  const r = parseInt(argb.slice(2, 4), 16)
  const g = parseInt(argb.slice(4, 6), 16)
  const b = parseInt(argb.slice(6, 8), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? HEADER_DARK_TEXT : HEADER_LIGHT_TEXT
}

/** Los nombres de hoja en Excel no admiten : \ / ? * [ ] ni más de 31 caracteres, y deben ser únicos */
function sanitizeSheetName(raw: string, used: Set<string>): string {
  let clean = raw.replace(/[:\\/?*[\]]/g, '-').trim()
  if (!clean) clean = 'Categoría'
  if (clean.length > 31) clean = clean.slice(0, 31).trim()

  let candidate = clean
  let n = 2
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n})`
    candidate = clean.slice(0, 31 - suffix.length) + suffix
    n++
  }
  used.add(candidate.toLowerCase())
  return candidate
}

function groupByCategory(products: Product[]): CategoryGroup[] {
  const order: string[] = []
  const map = new Map<string, CategoryGroup>()
  for (const p of products) {
    const name = p.category?.name || SIN_CATEGORIA
    if (!map.has(name)) {
      map.set(name, { name, colorArgb: hexToArgb(p.category?.color), products: [] })
      order.push(name)
    }
    map.get(name)!.products.push(p)
  }
  return order
    .map(name => map.get(name)!)
    .sort((a, b) => {
      if (a.name === SIN_CATEGORIA) return 1
      if (b.name === SIN_CATEGORIA) return -1
      return a.name.localeCompare(b.name, 'es')
    })
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

const DIACRITICS_RANGE_START = 0x0300
const DIACRITICS_RANGE_END = 0x036f

function slugForFile(text: string): string {
  const stripped = Array.from(text.normalize('NFD'))
    .filter(ch => {
      const code = ch.codePointAt(0) ?? 0
      return code < DIACRITICS_RANGE_START || code > DIACRITICS_RANGE_END
    })
    .join('')
  return stripped
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: BORDER_COLOR } }
  return { top: side, left: side, bottom: side, right: side }
}

/** Fila de título grande, con el color de la categoría (o el azul por defecto) de fondo */
function bannerRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  colCount: number,
  text: string,
  accentArgb: string,
  opts: { size?: number; height?: number } = {}
) {
  sheet.mergeCells(row, 1, row, colCount)
  const cell = sheet.getCell(row, 1)
  cell.value = text
  cell.font = { bold: true, size: opts.size ?? 14, color: { argb: contrastText(accentArgb) } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: accentArgb } }
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  sheet.getRow(row).height = opts.height ?? 24
}

/** Fila de subtítulo gris e itálica con datos de contexto (sucursal, fecha, totales) */
function subtitleRow(sheet: ExcelJS.Worksheet, row: number, colCount: number, text: string) {
  sheet.mergeCells(row, 1, row, colCount)
  const cell = sheet.getCell(row, 1)
  cell.value = text
  cell.font = { italic: true, size: 10, color: { argb: SUBTITLE_TEXT } }
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  sheet.getRow(row).height = 18
}

function headerRowStyle(sheet: ExcelJS.Worksheet, row: number, columns: ColumnDef[]) {
  const headerRow = sheet.getRow(row)
  columns.forEach((c, i) => {
    headerRow.getCell(i + 1).value = c.header
  })
  headerRow.eachCell(cell => {
    cell.font = { bold: true, size: 11, color: { argb: HEADER_LIGHT_TEXT } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = thinBorder()
  })
  headerRow.height = 22
  sheet.autoFilter = { from: { row, column: 1 }, to: { row, column: columns.length } }
}

function buildCategorySheet(
  workbook: ExcelJS.Workbook,
  group: CategoryGroup,
  sheetName: string,
  contextLabel: string | undefined,
  now: Date
) {
  const accentArgb = group.colorArgb || DEFAULT_ACCENT
  const colCount = PRODUCT_COLUMNS.length

  const sheet = workbook.addWorksheet(sheetName, {
    properties: { tabColor: { argb: accentArgb } },
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
  })

  sheet.columns = PRODUCT_COLUMNS.map(c => ({
    key: c.key,
    width: c.width,
    style: c.numFmt ? { numFmt: c.numFmt } : undefined,
  }))

  bannerRow(sheet, 1, colCount, group.name, accentArgb, { size: 15, height: 26 })

  const lowStockCount = group.products.filter(p => p.stock_quantity < p.stock_min).length
  const metaParts = [
    contextLabel,
    `${group.products.length} producto${group.products.length === 1 ? '' : 's'}`,
    lowStockCount > 0 ? `${lowStockCount} con stock bajo` : null,
    `Generado ${formatDateTime(now)}`,
  ].filter(Boolean)
  subtitleRow(sheet, 2, colCount, metaParts.join('   •   '))

  sheet.getRow(3).height = 6

  headerRowStyle(sheet, 4, PRODUCT_COLUMNS)

  const sorted = [...group.products].sort((a, b) =>
    (a.product?.name || '').localeCompare(b.product?.name || '', 'es')
  )

  sorted.forEach((p, idx) => {
    const isLow = p.stock_quantity < p.stock_min
    const row = sheet.addRow({
      nombre: p.product?.name || '(sin nombre)',
      barcode: p.barcode || '',
      sku: p.product?.sku || '',
      descripcion: p.product?.description || '',
      price_cost: p.price_cost,
      price_sale: p.price_sale,
      price_cost_usd: p.price_cost_usd ?? null,
      price_sale_usd: p.price_sale_usd ?? null,
      stock: p.stock_quantity,
      stock_min: p.stock_min,
      estado: isLow ? 'Stock bajo' : 'OK',
    })

    const zebraFill = isLow ? LOW_STOCK_FILL : (idx % 2 === 1 ? ZEBRA_FILL : null)
    row.eachCell({ includeEmpty: true }, cell => {
      cell.border = thinBorder()
      if (zebraFill) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: zebraFill } }
      }
    })

    const estadoCell = row.getCell(colCount)
    estadoCell.alignment = { horizontal: 'center' }
    estadoCell.font = { bold: isLow, color: { argb: isLow ? LOW_STOCK_TEXT : OK_TEXT } }
    row.height = 18
  })
}

function buildSummarySheet(
  workbook: ExcelJS.Workbook,
  groups: CategoryGroup[],
  sheetNameByCategory: Map<string, string>,
  contextLabel: string | undefined,
  now: Date
) {
  const colCount = SUMMARY_COLUMNS.length
  const totalProducts = groups.reduce((s, g) => s + g.products.length, 0)

  const sheet = workbook.addWorksheet('Resumen', {
    properties: { tabColor: { argb: DEFAULT_ACCENT } },
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
  })

  sheet.columns = SUMMARY_COLUMNS.map(c => ({
    key: c.key,
    width: c.width,
    style: c.numFmt ? { numFmt: c.numFmt } : undefined,
  }))

  bannerRow(sheet, 1, colCount, 'Resumen de productos', DEFAULT_ACCENT, { size: 16, height: 28 })

  const metaParts = [
    contextLabel,
    `${totalProducts} producto${totalProducts === 1 ? '' : 's'}`,
    `${groups.length} categoría${groups.length === 1 ? '' : 's'}`,
    `Generado ${formatDateTime(now)}`,
  ].filter(Boolean)
  subtitleRow(sheet, 2, colCount, metaParts.join('   •   '))

  sheet.getRow(3).height = 6

  headerRowStyle(sheet, 4, SUMMARY_COLUMNS)

  let totalUnidades = 0
  let totalBajo = 0
  let totalCosto = 0
  let totalVenta = 0

  groups.forEach((group, idx) => {
    const unidades = group.products.reduce((s, p) => s + (p.stock_quantity || 0), 0)
    const bajo = group.products.filter(p => p.stock_quantity < p.stock_min).length
    const valorCosto = group.products.reduce((s, p) => s + (p.stock_quantity || 0) * (p.price_cost || 0), 0)
    const valorVenta = group.products.reduce((s, p) => s + (p.stock_quantity || 0) * (p.price_sale || 0), 0)
    totalUnidades += unidades
    totalBajo += bajo
    totalCosto += valorCosto
    totalVenta += valorVenta

    const row = sheet.addRow({
      categoria: group.name,
      productos: group.products.length,
      stock_bajo: bajo,
      unidades,
      valor_costo: valorCosto,
      valor_venta: valorVenta,
      link: { text: 'Ver hoja →', hyperlink: `#'${sheetNameByCategory.get(group.name)}'!A1` },
    })

    row.eachCell({ includeEmpty: true }, cell => {
      cell.border = thinBorder()
      if (idx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_FILL } }
      }
    })

    const catArgb = group.colorArgb || DEFAULT_ACCENT
    const catCell = row.getCell(1)
    catCell.font = { bold: true, color: { argb: contrastText(catArgb) } }
    catCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: catArgb } }

    if (bajo > 0) {
      row.getCell(3).font = { bold: true, color: { argb: LOW_STOCK_TEXT } }
    }

    const linkCell = row.getCell(colCount)
    linkCell.font = { color: { argb: 'FF2563EB' }, underline: true }
    linkCell.alignment = { horizontal: 'center' }

    row.height = 20
  })

  const totalRow = sheet.addRow({
    categoria: 'Total',
    productos: totalProducts,
    stock_bajo: totalBajo,
    unidades: totalUnidades,
    valor_costo: totalCosto,
    valor_venta: totalVenta,
    link: '',
  })
  const topBorder: Partial<ExcelJS.Border> = { style: 'double', color: { argb: HEADER_BG } }
  totalRow.eachCell({ includeEmpty: true }, cell => {
    cell.font = { bold: true }
    cell.border = { top: topBorder }
  })
  totalRow.height = 20
}

export interface ExcelExportOptions {
  /** Texto de contexto mostrado en cada hoja, ej: "Sucursal: Centro" o "Proveedor: Acme SRL" */
  contextLabel?: string
  /** Nombre base del archivo, sin fecha ni extensión (se sanitiza automáticamente) */
  fileBaseName?: string
}

export async function exportProductsToExcel(products: Product[], options: ExcelExportOptions = {}): Promise<void> {
  if (!products.length) return

  const now = new Date()
  const groups = groupByCategory(products)

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'BG Gestión'
  workbook.created = now

  const usedNames = new Set<string>(['resumen'])
  const sheetNameByCategory = new Map<string, string>()
  for (const group of groups) {
    sheetNameByCategory.set(group.name, sanitizeSheetName(group.name, usedNames))
  }

  buildSummarySheet(workbook, groups, sheetNameByCategory, options.contextLabel, now)
  for (const group of groups) {
    buildCategorySheet(workbook, group, sheetNameByCategory.get(group.name)!, options.contextLabel, now)
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const dateStr = now.toISOString().slice(0, 10)
  const base = options.fileBaseName ? slugForFile(options.fileBaseName) : 'productos'
  link.href = url
  link.download = `${base}_${dateStr}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

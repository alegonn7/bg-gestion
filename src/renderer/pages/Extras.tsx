import { useEffect, useState } from 'react'
import { Printer, Plus, Trash2, Tag, X, Loader2, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import JsBarcode from 'jsbarcode'

// ─── Types ───────────────────────────────────────────────────────────────────

interface BarcodeSheet {
  id: string
  organization_id: string
  name: string
  codes: string[]
  size: string
  created_at: string
}

// ─── Tamaños predefinidos ────────────────────────────────────────────────────

const LABEL_SIZES = [
  { id: 'xxs', label: 'Mini',       sub: '~150 por hoja', perSheet: 150, labelMM: 20, svgMM: 17, bW: 0.6, bH: 8,  fontSize: 5  },
  { id: 'xs',  label: 'Muy chico',  sub: '~100 por hoja', perSheet: 100, labelMM: 28, svgMM: 25, bW: 0.8, bH: 10, fontSize: 6  },
  { id: 'sm', label: 'Chico',      sub: '~65 por hoja',  perSheet: 65,  labelMM: 36, svgMM: 32, bW: 1.0, bH: 15, fontSize: 7  },
  { id: 'md', label: 'Mediano',    sub: '~40 por hoja',  perSheet: 40,  labelMM: 46, svgMM: 42, bW: 1.4, bH: 28, fontSize: 9  },
  { id: 'lg', label: 'Grande',     sub: '~24 por hoja',  perSheet: 24,  labelMM: 62, svgMM: 58, bW: 1.8, bH: 45, fontSize: 11 },
] as const

type SizeId = typeof LABEL_SIZES[number]['id']

function getSizeConfig(id: string) {
  return LABEL_SIZES.find(s => s.id === id) ?? LABEL_SIZES[2]
}

const JEWELRY_PER_SHEET = 40

// ─── Jewelry label sheet ─────────────────────────────────────────────────────
// Shape: [front 22mm | back 22mm]—tail 28×2mm
// Front has barcode; back is blank (folds over front); tail threads through jewelry.

function buildJewelrySheetHTML(sheet: BarcodeSheet, autoPrint = false): string {
  const labels = sheet.codes.map(code => `
    <div class="jlabel">
      <div class="jfront">${generateBarcodeSVG(code, 0.65, 7, 3.5, 2)}</div>
      <div class="jback"><div class="seg st"></div><div class="seg sb"></div></div>
      <div class="jtail"></div>
    </div>`
  ).join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${sheet.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: white; }
    .page { width: 210mm; padding: 4mm; display: grid; grid-template-columns: repeat(2, 72mm); gap: 5mm 10mm; }
    .jlabel { display: flex; align-items: center; page-break-inside: avoid; }
    .jfront {
      width: 22mm; height: 10mm; flex-shrink: 0;
      border: 1px solid #555; border-right: none; border-radius: 2mm 0 0 2mm;
      display: flex; align-items: center; justify-content: center;
      overflow: hidden; padding: 0.5mm;
    }
    .jfront svg { width: 19mm; height: auto; }
    .jback {
      position: relative; width: 22mm; height: 10mm; flex-shrink: 0;
      border-top: 1px solid #555; border-bottom: 1px solid #555;
      border-left: 1px dashed #888; border-right: none;
    }
    .seg { position: absolute; right: -1px; width: 1px; background: #555; }
    .st { top: 0; height: 4mm; }
    .sb { bottom: 0; height: 4mm; }
    .jtail {
      flex-shrink: 0; width: 28mm; height: 2mm;
      border: 1px solid #555; border-left: none; border-radius: 0 1mm 1mm 0;
    }
    @media print { @page { size: A4; margin: 0; } body { margin: 0; } }
  </style>
</head>
<body>
  <div class="page">${labels}</div>
  ${autoPrint ? '<script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>' : ''}
</body>
</html>`
}

// ─── Counter — deriva del máximo código existente en la org ──────────────────

async function getNextStart(organizationId: string): Promise<number> {
  const { data } = await supabase
    .from('barcode_sheets')
    .select('codes')
    .eq('organization_id', organizationId)

  if (!data || data.length === 0) return 0

  let max = 0
  for (const sheet of data) {
    for (const code of (sheet.codes as string[])) {
      const n = parseInt(code, 10)
      if (!isNaN(n) && n > max) max = n
    }
  }
  return max
}

function generateCodes(start: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(start + i + 1).padStart(7, '0'))
}

// ─── Barcode generation ───────────────────────────────────────────────────────

function generateBarcodeSVG(value: string, bW: number, bH: number, fontSize: number, margin = 3): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  try {
    JsBarcode(svg, value, {
      format: 'CODE128',
      width: bW,
      height: bH,
      displayValue: true,
      fontSize,
      margin,
    })
    return svg.outerHTML
  } catch { return '' }
}

function buildSheetHTML(sheet: BarcodeSheet, autoPrint = false): string {
  if (sheet.size === 'jewelry') return buildJewelrySheetHTML(sheet, autoPrint)
  const cfg = getSizeConfig(sheet.size)
  const labels = sheet.codes.map(code => `
    <div class="label">
      ${generateBarcodeSVG(code, cfg.bW, cfg.bH, cfg.fontSize)}
    </div>`
  ).join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${sheet.name}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: white; }
    .page { width: 210mm; padding: 4mm; display: flex; flex-wrap: wrap; gap: 2mm; }
    .label {
      width: ${cfg.labelMM}mm;
      border: 1px dashed #aaa;
      padding: 1.5mm 1mm;
      display: flex;
      align-items: center;
      justify-content: center;
      page-break-inside: avoid;
    }
    .label svg { width: ${cfg.svgMM}mm; height: auto; }
    @media print { @page { size: A4; margin: 0; } body { margin: 0; } }
  </style>
</head>
<body>
  <div class="page">${labels}</div>
  ${autoPrint ? '<script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>' : ''}
</body>
</html>`
}

function printSheet(sheet: BarcodeSheet) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(buildSheetHTML(sheet, true))
  win.document.close()
}

async function exportSheetPDF(sheet: BarcodeSheet) {
  const html = buildSheetHTML(sheet, false)
  const filename = `${sheet.name.replace(/[^a-zA-Z0-9áéíóúñ ]/g, '_')}.pdf`
  await window.electron.exportPdf(html, filename)
}

// ─── Creator ─────────────────────────────────────────────────────────────────

function SheetCreator({ organizationId, onSave, onCancel }: {
  organizationId: string
  onSave: (sheet: BarcodeSheet) => void
  onCancel: () => void
}) {
  const [sheetName, setSheetName] = useState('')
  const [sizeId, setSizeId] = useState<SizeId>('md')
  const [format, setFormat] = useState<'standard' | 'jewelry'>('standard')
  const [saving, setSaving] = useState(false)

  const perSheet = format === 'jewelry' ? JEWELRY_PER_SHEET : getSizeConfig(sizeId).perSheet

  const handleSave = async () => {
    if (!sheetName.trim() || saving) return
    setSaving(true)
    try {
      const start = await getNextStart(organizationId)
      const codes = generateCodes(start, perSheet)
      const size = format === 'jewelry' ? 'jewelry' : sizeId

      const { data, error } = await supabase
        .from('barcode_sheets')
        .insert({ organization_id: organizationId, name: sheetName.trim(), codes, size })
        .select()
        .single()

      if (error) throw error
      onSave(data as BarcodeSheet)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full flex flex-col items-center justify-center bg-gray-50">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">Nueva hoja</h2>
          <button onClick={onCancel} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la hoja</label>
            <input
              type="text"
              placeholder="Ej: Almacén mayo 2026"
              value={sheetName}
              onChange={e => setSheetName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()}
              autoFocus
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Formato</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFormat('standard')}
                className={`px-4 py-3 rounded-lg border-2 text-left transition ${format === 'standard' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <p className={`text-sm font-semibold ${format === 'standard' ? 'text-blue-700' : 'text-gray-800'}`}>Estándar</p>
                <p className="text-xs text-gray-400 mt-0.5">Solo código de barras</p>
              </button>
              <button
                onClick={() => setFormat('jewelry')}
                className={`px-4 py-3 rounded-lg border-2 text-left transition ${format === 'jewelry' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
              >
                <p className={`text-sm font-semibold ${format === 'jewelry' ? 'text-blue-700' : 'text-gray-800'}`}>Joyería</p>
                <p className="text-xs text-gray-400 mt-0.5">65×11mm con solapas</p>
              </button>
            </div>
          </div>

          {format === 'standard' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tamaño de etiqueta</label>
              <div className="grid grid-cols-2 gap-2">
                {LABEL_SIZES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSizeId(s.id)}
                    className={`px-4 py-3 rounded-lg border-2 text-left transition ${
                      sizeId === s.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className={`text-sm font-semibold ${sizeId === s.id ? 'text-blue-700' : 'text-gray-800'}`}>{s.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {format === 'jewelry' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-1">
              <p className="font-medium">~{JEWELRY_PER_SHEET} etiquetas por hoja · 3 columnas</p>
              <p>Código en la solapa izquierda (32mm). Línea punteada = doblar. Cortar por el borde exterior.</p>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={!sheetName.trim() || saving}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            {saving ? 'Generando...' : `Generar e imprimir (~${perSheet} etiquetas)`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ExtrasPage() {
  const { organization } = useAuthStore()
  const [sheets, setSheets] = useState<BarcodeSheet[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    if (!organization) return
    supabase
      .from('barcode_sheets')
      .select('*')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setSheets((data as BarcodeSheet[]) || [])
        setLoading(false)
      })
  }, [organization])

  const handleSave = (sheet: BarcodeSheet) => {
    setSheets(prev => [sheet, ...prev])
    setCreating(false)
    printSheet(sheet)
  }

  const deleteSheet = async (id: string) => {
    await supabase.from('barcode_sheets').delete().eq('id', id)
    setSheets(prev => prev.filter(s => s.id !== id))
  }

  if (creating && organization) {
    return <SheetCreator organizationId={organization.id} onSave={handleSave} onCancel={() => setCreating(false)} />
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Tag className="w-6 h-6 text-blue-600" /> Etiquetas de códigos de barra
          </h1>
          <p className="text-sm text-gray-500 mt-1">Generá hojas A4 con códigos únicos para imprimir</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
        >
          <Plus className="w-5 h-5" /> Nueva hoja
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        ) : sheets.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Tag className="w-14 h-14 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">No hay hojas creadas todavía</p>
            <p className="text-sm mt-1">Hacé click en "Nueva hoja" para empezar</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {sheets.map(sheet => {
              const cfg = getSizeConfig(sheet.size)
              return (
                <div key={sheet.id} className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Tag className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{sheet.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(sheet.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      {' · '}{cfg.label} · {sheet.codes.length} código{sheet.codes.length !== 1 ? 's' : ''}
                      {sheet.codes.length > 0 && ` · ${sheet.codes[0]} → ${sheet.codes[sheet.codes.length - 1]}`}
                    </p>
                  </div>
                  <button
                    onClick={() => printSheet(sheet)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                  >
                    <Printer className="w-4 h-4" /> Imprimir
                  </button>
                  <button
                    onClick={() => exportSheetPDF(sheet)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 text-sm rounded-lg hover:bg-gray-50"
                  >
                    <Download className="w-4 h-4" /> PDF
                  </button>
                  {confirmDeleteId === sheet.id ? (
                    <span className="flex items-center gap-1.5">
                      <span className="text-xs text-red-600 font-medium">¿Eliminar?</span>
                      <button
                        onClick={() => { deleteSheet(sheet.id); setConfirmDeleteId(null) }}
                        className="px-2.5 py-1 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700"
                      >
                        Sí
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-gray-200"
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(sheet.id)}
                      title="Eliminar hoja"
                      className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

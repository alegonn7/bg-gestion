import { useEffect, useState, useMemo } from 'react'
import {
  RefreshCw, TrendingUp, TrendingDown, DollarSign, Wallet,
  CreditCard, Building2, FileText, ArrowUpRight, ArrowDownRight,
  Download, Minus, ShoppingCart, Search, Package, X, ChevronRight,
  Plus, BookOpen
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import { useAccountingStore, EXPENSE_CATEGORIES, INCOME_CATEGORIES, type BankBalance, type RawSale, type RawExtraMovement } from '@/store/accounting'
import { useAuthStore } from '@/store/auth'
import { useTransferAccounts } from '@/store/transfer-accounts'
import * as Papa from 'papaparse'

type Tab = 'resumen' | 'pl' | 'flujo' | 'gastos' | 'cuentas' | 'compras' | 'libro'

type DatePreset = 'este-mes' | 'mes-anterior' | 'ultimos-30' | 'ultimos-90' | 'este-anio' | 'custom'

const fmt = (n: number) =>
  n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })

const fmtPct = (n: number) =>
  `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`

const BAR_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#84CC16', '#EC4899', '#6B7280']

const PAGE_SIZE = 25

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null
  return (
    <div className="flex items-center justify-end gap-2 px-4 py-2.5 border-t border-gray-100 bg-gray-50">
      <span className="text-xs text-gray-400 mr-auto">Página {page} de {total}</span>
      <button
        onClick={() => onChange(1)} disabled={page === 1}
        className="px-2 py-1 text-xs rounded border border-gray-200 bg-white text-gray-600 disabled:opacity-30 hover:bg-gray-50"
      >«</button>
      <button
        onClick={() => onChange(page - 1)} disabled={page === 1}
        className="px-2.5 py-1 text-xs rounded border border-gray-200 bg-white text-gray-600 disabled:opacity-30 hover:bg-gray-50"
      >‹ Anterior</button>
      <button
        onClick={() => onChange(page + 1)} disabled={page === total}
        className="px-2.5 py-1 text-xs rounded border border-gray-200 bg-white text-gray-600 disabled:opacity-30 hover:bg-gray-50"
      >Siguiente ›</button>
      <button
        onClick={() => onChange(total)} disabled={page === total}
        className="px-2 py-1 text-xs rounded border border-gray-200 bg-white text-gray-600 disabled:opacity-30 hover:bg-gray-50"
      >»</button>
    </div>
  )
}

function DateRangePicker({
  start, end, onApply
}: {
  start: Date, end: Date, onApply: (s: Date, e: Date) => void
}) {
  const [preset, setPreset] = useState<DatePreset>('este-mes')
  const [customStart, setCustomStart] = useState(start.toISOString().split('T')[0])
  const [customEnd, setCustomEnd] = useState(end.toISOString().split('T')[0])

  const applyPreset = (p: DatePreset) => {
    setPreset(p)
    const now = new Date()
    if (p === 'este-mes') {
      onApply(new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59))
    } else if (p === 'mes-anterior') {
      onApply(new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59))
    } else if (p === 'ultimos-30') {
      const s = new Date(now); s.setDate(s.getDate() - 30)
      onApply(s, now)
    } else if (p === 'ultimos-90') {
      const s = new Date(now); s.setDate(s.getDate() - 90)
      onApply(s, now)
    } else if (p === 'este-anio') {
      onApply(new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear(), 11, 31, 23, 59, 59))
    }
  }

  const applyCustom = () => {
    if (!customStart || !customEnd) return
    const s = new Date(customStart + 'T00:00:00')
    const e = new Date(customEnd + 'T23:59:59')
    if (s > e) {
      alert('La fecha de inicio no puede ser mayor a la fecha de fin')
      return
    }
    onApply(s, e)
  }

  const presets: { id: DatePreset; label: string }[] = [
    { id: 'este-mes', label: 'Este mes' },
    { id: 'mes-anterior', label: 'Mes anterior' },
    { id: 'ultimos-30', label: 'Últimos 30 días' },
    { id: 'ultimos-90', label: 'Últimos 90 días' },
    { id: 'este-anio', label: 'Este año' },
    { id: 'custom', label: 'Personalizado' },
  ]

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map(p => (
        <button
          key={p.id}
          onClick={() => applyPreset(p.id)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            preset === p.id
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300 hover:text-blue-600'
          }`}
        >
          {p.label}
        </button>
      ))}
      {preset === 'custom' && (
        <div className="flex items-center gap-1">
          <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
            className="px-2 py-1 border border-gray-200 rounded text-xs" />
          <span className="text-gray-400 text-xs">→</span>
          <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
            className="px-2 py-1 border border-gray-200 rounded text-xs" />
          <button onClick={applyCustom}
            className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700">
            Aplicar
          </button>
        </div>
      )}
    </div>
  )
}

function SummaryCard({
  title, value, subtitle, icon: Icon, color, trend
}: {
  title: string
  value: string
  subtitle?: string
  icon: typeof DollarSign
  color: 'blue' | 'green' | 'red' | 'purple' | 'gray'
  trend?: 'up' | 'down' | 'neutral'
}) {
  const colors = {
    blue: { bg: 'bg-blue-50', icon: 'text-blue-600', ring: 'bg-blue-100' },
    green: { bg: 'bg-green-50', icon: 'text-green-600', ring: 'bg-green-100' },
    red: { bg: 'bg-red-50', icon: 'text-red-600', ring: 'bg-red-100' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-600', ring: 'bg-purple-100' },
    gray: { bg: 'bg-gray-50', icon: 'text-gray-600', ring: 'bg-gray-100' },
  }
  const c = colors[color]
  return (
    <div className={`${c.bg} rounded-xl p-4 border border-white`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${color === 'red' ? 'text-red-700' : color === 'green' ? 'text-green-700' : 'text-gray-900'}`}>
            {value}
          </p>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className={`p-2 rounded-lg ${c.ring}`}>
          <Icon className={`w-5 h-5 ${c.icon}`} />
        </div>
      </div>
      {trend && (
        <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-500' : 'text-gray-400'}`}>
          {trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : trend === 'down' ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
        </div>
      )}
    </div>
  )
}

// ─── Tab: Resumen ─────────────────────────────────────────────────────────────
function getMovementsForAccount(
  accountId: string,
  rawSales: RawSale[],
  rawExtraMovements: RawExtraMovement[],
): { id: string; fecha: string; concepto: string; tipo: 'venta' | 'ingreso' | 'gasto'; monto: number }[] {
  const result: { id: string; fecha: string; concepto: string; tipo: 'venta' | 'ingreso' | 'gasto'; monto: number }[] = []

  if (accountId === '__cash__') {
    rawSales.filter(s => (s.cash_amount || 0) > 0).forEach(s =>
      result.push({ id: s.id, fecha: s.created_at, concepto: 'Venta', tipo: 'venta', monto: s.cash_amount! })
    )
    rawExtraMovements.filter(m => m.source === 'cash').forEach(m =>
      result.push({ id: m.id, fecha: m.created_at, concepto: m.description || (m.type === 'ingreso' ? 'Ingreso' : 'Gasto'), tipo: m.type, monto: m.amount })
    )
  } else if (accountId === '__card__') {
    rawSales.filter(s => (s.card_amount || 0) > 0).forEach(s =>
      result.push({ id: s.id, fecha: s.created_at, concepto: 'Venta con tarjeta', tipo: 'venta', monto: s.card_amount! })
    )
  } else if (accountId === '__personal__') {
    rawExtraMovements.filter(m => m.source === 'personal').forEach(m =>
      result.push({ id: m.id, fecha: m.created_at, concepto: m.description || (m.type === 'ingreso' ? 'Ingreso' : 'Gasto'), tipo: m.type, monto: m.amount })
    )
  } else if (accountId === '__other__') {
    rawExtraMovements.filter(m => m.source === 'other').forEach(m =>
      result.push({ id: m.id, fecha: m.created_at, concepto: m.description || (m.type === 'ingreso' ? 'Ingreso' : 'Gasto'), tipo: m.type, monto: m.amount })
    )
  } else {
    // cuenta de transferencia específica
    rawSales.filter(s => (s.transfer_amount || 0) > 0 && s.transfer_account_id === accountId).forEach(s =>
      result.push({ id: s.id, fecha: s.created_at, concepto: 'Venta (transferencia)', tipo: 'venta', monto: s.transfer_amount! })
    )
    rawExtraMovements.filter(m => m.source === 'bank' && m.transfer_account_id === accountId).forEach(m =>
      result.push({ id: m.id, fecha: m.created_at, concepto: m.description || (m.type === 'ingreso' ? 'Ingreso' : 'Gasto'), tipo: m.type, monto: m.amount })
    )
    // también transferencias sin cuenta asignada (generic)
    if (accountId === '__transfer_generic__') {
      rawSales.filter(s => (s.transfer_amount || 0) > 0 && !s.transfer_account_id).forEach(s =>
        result.push({ id: s.id, fecha: s.created_at, concepto: 'Venta (transferencia)', tipo: 'venta', monto: s.transfer_amount! })
      )
    }
  }

  return result.sort((a, b) => b.fecha.localeCompare(a.fecha))
}

const SOURCE_OPTIONS = [
  { value: 'cash',     label: '💵 Efectivo (caja)' },
  { value: 'personal', label: '💵 Efectivo (fuera)' },
  { value: 'bank',     label: '🏦 Transferencia' },
  { value: 'other',    label: '📌 Otro' },
]

type LedgerEntry = {
  id: string
  fecha: string
  tipo: 'venta' | 'ingreso' | 'gasto'
  descripcion: string
  categoria: string | null
  source: string
  monto: number
}

function GastosTab() {
  const { rawExtraMovements, rawSales, createOperation } = useAccountingStore()
  const { accounts: transferAccounts, fetchAccounts } = useTransferAccounts()

  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'gasto' | 'ingreso' | 'venta'>('all')
  const [filterCat, setFilterCat] = useState('')
  const [page, setPage] = useState(1)

  const [form, setForm] = useState({
    type: 'gasto' as 'gasto' | 'ingreso',
    fecha: new Date().toISOString().split('T')[0],
    amount: '',
    description: '',
    category: '',
    source: 'cash',
    transfer_account_id: '',
  })

  useEffect(() => { fetchAccounts() }, [])
  useEffect(() => { setPage(1) }, [filterType, filterCat])

  const allCategories = form.type === 'gasto' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES

  // Unificar ventas + movimientos en una sola lista
  const allEntries = useMemo((): LedgerEntry[] => {
    const sales: LedgerEntry[] = rawSales.map(s => ({
      id: s.id,
      fecha: s.created_at,
      tipo: 'venta' as const,
      descripcion: 'Venta',
      categoria: 'ventas',
      source: [
        s.cash_amount && s.cash_amount > 0 ? 'Efectivo' : null,
        s.card_amount && s.card_amount > 0 ? 'Tarjeta' : null,
        s.transfer_amount && s.transfer_amount > 0 ? 'Transferencia' : null,
      ].filter(Boolean).join(' + ') || 'Efectivo',
      monto: s.total,
    }))
    const extras: LedgerEntry[] = rawExtraMovements.map(m => ({
      id: m.id,
      fecha: m.created_at,
      tipo: m.type,
      descripcion: m.description,
      categoria: m.category,
      source: SOURCE_OPTIONS.find(s => s.value === m.source)?.label || m.source,
      monto: m.amount,
    }))
    return [...sales, ...extras].sort((a, b) => b.fecha.localeCompare(a.fecha))
  }, [rawSales, rawExtraMovements])

  const movements = useMemo(() => {
    return allEntries
      .filter(m => filterType === 'all' || m.tipo === filterType)
      .filter(m => !filterCat || m.categoria === filterCat)
  }, [allEntries, filterType, filterCat])

  const totalPages = Math.max(1, Math.ceil(movements.length / PAGE_SIZE))
  const pagedMovements = movements.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const totalIngresos = useMemo(() =>
    allEntries.filter(m => m.tipo === 'ingreso' || m.tipo === 'venta').reduce((s, m) => s + m.monto, 0),
    [allEntries])
  const totalGastos = useMemo(() =>
    allEntries.filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0),
    [allEntries])

  const handleSave = async () => {
    setFormError('')
    const amount = parseFloat(form.amount)
    if (!amount || amount <= 0) { setFormError('Ingresá un monto válido'); return }
    if (!form.description.trim()) { setFormError('La descripción es obligatoria'); return }
    setSaving(true)
    try {
      await createOperation({
        type: form.type,
        amount,
        description: form.description.trim(),
        category: form.category || null,
        source: form.source,
        transfer_account_id: form.source === 'bank' ? form.transfer_account_id || null : null,
        fecha: new Date(form.fecha + 'T12:00:00').toISOString(),
      })
      setForm({ type: 'gasto', fecha: new Date().toISOString().split('T')[0], amount: '', description: '', category: '', source: 'cash', transfer_account_id: '' })
      setShowForm(false)
    } catch (e: any) {
      setFormError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Resumen + botón */}
      <div className="flex items-center gap-4">
        <div className="flex-1 grid grid-cols-2 gap-3">
          <div className="bg-green-50 border border-green-200 rounded-xl p-3">
            <p className="text-xs text-green-600 font-medium">Total ingresos</p>
            <p className="text-xl font-bold text-green-700 mt-0.5">{fmt(totalIngresos)}</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-xs text-red-600 font-medium">Total gastos</p>
            <p className="text-xl font-bold text-red-700 mt-0.5">{fmt(totalGastos)}</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nueva entrada
        </button>
      </div>

      {/* Formulario inline */}
      {showForm && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-blue-800">Nueva operación</h3>

          {formError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}

          <div className="grid grid-cols-2 gap-3">
            {/* Tipo */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-300">
                <button onClick={() => setForm(f => ({ ...f, type: 'gasto', category: '' }))}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${form.type === 'gasto' ? 'bg-red-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  Gasto
                </button>
                <button onClick={() => setForm(f => ({ ...f, type: 'ingreso', category: '' }))}
                  className={`flex-1 py-2 text-sm font-medium transition-colors ${form.type === 'ingreso' ? 'bg-green-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                  Ingreso
                </button>
              </div>
            </div>

            {/* Fecha */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
              <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>

            {/* Monto */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Monto</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="text" inputMode="decimal" value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                  className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>

            {/* Categoría */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Categoría</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="">Sin categoría</option>
                {allCategories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Descripción</label>
            <input type="text" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Ej: Sueldo Juan, Alquiler local, etc."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>

          {/* Cuenta */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cuenta / Medio de pago</label>
            <div className="grid grid-cols-4 gap-2">
              {SOURCE_OPTIONS.map(s => (
                <button key={s.value} onClick={() => setForm(f => ({ ...f, source: s.value }))}
                  className={`py-2 px-2 text-xs rounded-lg border transition-colors text-center ${form.source === s.value ? 'border-blue-400 bg-blue-100 text-blue-700 font-medium' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>
                  {s.label}
                </button>
              ))}
            </div>
            {form.source === 'bank' && transferAccounts.length > 0 && (
              <select value={form.transfer_account_id} onChange={e => setForm(f => ({ ...f, transfer_account_id: e.target.value }))}
                className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                <option value="">Cuenta genérica</option>
                {transferAccounts.filter(a => a.id !== 'generica').map(a => (
                  <option key={a.id} value={a.id}>{a.nombre}</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={() => setShowForm(false)}
              className="flex-1 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
          {([
            { v: 'all',     label: 'Todos' },
            { v: 'venta',   label: 'Ventas' },
            { v: 'ingreso', label: 'Otros ingresos' },
            { v: 'gasto',   label: 'Gastos' },
          ] as const).map(t => (
            <button key={t.v} onClick={() => setFilterType(t.v)}
              className={`px-3 py-1.5 font-medium transition-colors ${filterType === t.v ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 outline-none">
          <option value="">Todas las categorías</option>
          <option value="ventas">Ventas</option>
          {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          {INCOME_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <span className="text-xs text-gray-400 ml-auto">{movements.length} entradas</span>
      </div>

      {/* Tabla */}
      {movements.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No hay operaciones en el período</p>
          <p className="text-xs text-gray-400 mt-1">Usá "Nueva entrada" para registrar gastos, sueldos, pagos, etc.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-2.5">Fecha</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-2.5">Descripción</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-2.5">Categoría</th>
                <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-2.5">Medio</th>
                <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wide px-4 py-2.5">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pagedMovements.map(m => {
                const catLabel = m.categoria === 'ventas' ? 'Ventas'
                  : [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].find(c => c.value === m.categoria)?.label
                return (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                      {new Date(m.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 max-w-xs truncate">{m.descripcion}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{catLabel || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[120px] truncate">{m.source}</td>
                    <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${m.tipo === 'gasto' ? 'text-red-500' : m.tipo === 'venta' ? 'text-blue-600' : 'text-green-600'}`}>
                      {m.tipo === 'gasto' ? '-' : '+'}{fmt(m.monto)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 bg-gray-50">
              <tr>
                <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-gray-600">
                  {filterType === 'all' ? 'Neto del período' : 'Total filtrado'}
                  {movements.length > PAGE_SIZE && <span className="text-gray-400 font-normal ml-1">(sobre {movements.length} entradas)</span>}
                </td>
                <td className={`px-4 py-2.5 text-right font-bold tabular-nums ${
                  filterType === 'gasto' ? 'text-red-500' :
                  filterType === 'ingreso' || filterType === 'venta' ? 'text-green-600' :
                  (totalIngresos - totalGastos) >= 0 ? 'text-gray-900' : 'text-red-600'
                }`}>
                  {filterType === 'all'
                    ? fmt(totalIngresos - totalGastos)
                    : fmt(movements.reduce((s, m) => s + m.monto, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
          <Pagination page={page} total={totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  )
}

function CuentasTab() {
  const { bankBalances, rawSales, rawExtraMovements, createOperation } = useAccountingStore()
  const [selected, setSelected] = useState<BankBalance | null>(null)
  const [detailPage, setDetailPage] = useState(1)
  const [adjusting, setAdjusting] = useState<BankBalance | null>(null)
  const [realAmount, setRealAmount] = useState('')
  const [adjustSaving, setAdjustSaving] = useState(false)
  const [adjustError, setAdjustError] = useState('')

  const movements = useMemo(
    () => selected ? getMovementsForAccount(selected.account_id, rawSales, rawExtraMovements) : [],
    [selected, rawSales, rawExtraMovements]
  )

  useEffect(() => { setDetailPage(1) }, [selected])

  const ADJUSTABLE = ['__cash__', '__personal__', '__other__']
  const canAdjust = (b: BankBalance) => ADJUSTABLE.includes(b.account_id) || (!b.account_id.startsWith('__'))

  const sourceForAccount = (b: BankBalance): { source: string; transfer_account_id?: string } => {
    if (b.account_id === '__cash__') return { source: 'cash' }
    if (b.account_id === '__personal__') return { source: 'personal' }
    if (b.account_id === '__other__') return { source: 'other' }
    return { source: 'bank', transfer_account_id: b.account_id }
  }

  const handleAdjust = async () => {
    if (!adjusting) return
    const real = parseFloat(realAmount.replace(',', '.'))
    if (isNaN(real)) { setAdjustError('Ingresá un monto válido'); return }
    const diff = real - adjusting.net
    if (diff === 0) { setAdjustError('El saldo ya coincide, no hay nada que ajustar'); return }
    setAdjustSaving(true)
    setAdjustError('')
    try {
      const { source, transfer_account_id } = sourceForAccount(adjusting)
      await createOperation({
        type: diff > 0 ? 'ingreso' : 'gasto',
        amount: Math.abs(diff),
        description: `Ajuste de saldo — ${adjusting.account_name}`,
        category: 'ajuste_saldo',
        source,
        transfer_account_id,
        fecha: new Date().toISOString(),
      })
      setAdjusting(null)
      setRealAmount('')
    } catch (e: any) {
      setAdjustError(e.message)
    } finally {
      setAdjustSaving(false)
    }
  }

  if (bankBalances.length === 0)
    return (
      <div className="text-center py-16">
        <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No hay movimientos en el período</p>
      </div>
    )

  return (
    <>
    {/* Modal ajuste de saldo */}
    {adjusting && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
          <h3 className="text-base font-bold text-gray-900 mb-1">Ajustar saldo — {adjusting.account_name}</h3>
          <p className="text-xs text-gray-500 mb-4">
            El sistema registra <span className="font-semibold text-gray-700">{fmt(adjusting.net)}</span> en esta cuenta.
            Ingresá el saldo real actual y se creará un movimiento de ajuste por la diferencia.
          </p>

          <label className="block text-xs font-medium text-gray-600 mb-1">Saldo real ahora</label>
          <div className="relative mb-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
            <input
              type="text" inputMode="decimal"
              value={realAmount}
              onChange={e => { setRealAmount(e.target.value); setAdjustError('') }}
              placeholder="0"
              autoFocus
              className="w-full pl-7 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Preview del ajuste */}
          {realAmount && !isNaN(parseFloat(realAmount.replace(',', '.'))) && (() => {
            const real = parseFloat(realAmount.replace(',', '.'))
            const diff = real - adjusting.net
            return (
              <div className="border border-gray-200 rounded-xl p-3 mb-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-gray-500">
                  <span>Sistema registra</span>
                  <span className="font-medium text-gray-700">{fmt(adjusting.net)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Saldo real ingresado</span>
                  <span className="font-medium text-gray-700">{fmt(real)}</span>
                </div>
                <div className={`flex justify-between pt-1.5 border-t border-gray-100 font-semibold ${diff === 0 ? 'text-gray-400' : diff > 0 ? 'text-green-700' : 'text-red-600'}`}>
                  <span>{diff === 0 ? 'Sin diferencia' : diff > 0 ? 'Ajuste a registrar (ingreso)' : 'Ajuste a registrar (gasto)'}</span>
                  <span>{diff === 0 ? '—' : `${diff > 0 ? '+' : '-'}${fmt(Math.abs(diff))}`}</span>
                </div>
              </div>
            )
          })()}

          {adjustError && <p className="text-xs text-red-600 mb-3">{adjustError}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => { setAdjusting(null); setRealAmount(''); setAdjustError('') }}
              className="flex-1 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50"
            >Cancelar</button>
            <button
              onClick={handleAdjust} disabled={adjustSaving}
              className="flex-1 py-2 text-sm bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50"
            >{adjustSaving ? 'Guardando...' : 'Confirmar ajuste'}</button>
          </div>
        </div>
      </div>
    )}

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Lista de cuentas */}
      <div className="space-y-2">
        {bankBalances.map(b => (
          <div key={b.account_id} className={`rounded-xl border transition-colors ${selected?.account_id === b.account_id ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}>
            <button
              onClick={() => setSelected(s => s?.account_id === b.account_id ? null : b)}
              className="w-full text-left p-4"
            >
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700 truncate pr-2">{b.account_name}</span>
                <span className={`text-sm font-bold tabular-nums shrink-0 ${b.net >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{fmt(b.net)}</span>
              </div>
              <div className="flex gap-3 mt-1 text-xs">
                <span className="text-green-600">+{fmt(b.salesIn + b.incomesIn)}</span>
                <span className="text-red-400">-{fmt(b.expensesOut)}</span>
              </div>
            </button>
            {canAdjust(b) && (
              <div className="px-4 pb-3 -mt-1">
                <button
                  onClick={() => { setAdjusting(b); setRealAmount(''); setAdjustError('') }}
                  className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                >
                  Ajustar saldo real →
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Detalle */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-4">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full py-16 text-center">
            <ChevronRight className="w-8 h-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">Seleccioná una cuenta para ver sus movimientos</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">{selected.account_name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{movements.length} movimientos</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {movements.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No hay movimientos individuales para esta cuenta</p>
            ) : (() => {
              const detailTotalPages = Math.max(1, Math.ceil(movements.length / PAGE_SIZE))
              const pagedDetail = movements.slice((detailPage - 1) * PAGE_SIZE, detailPage * PAGE_SIZE)
              return (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide pb-2 pr-4">Fecha</th>
                        <th className="text-left text-xs font-medium text-gray-400 uppercase tracking-wide pb-2">Concepto</th>
                        <th className="text-right text-xs font-medium text-gray-400 uppercase tracking-wide pb-2">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {pagedDetail.map(m => (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="py-2 pr-4 text-xs text-gray-500 whitespace-nowrap">
                            {new Date(m.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                            {' '}
                            <span className="text-gray-300">{new Date(m.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
                          </td>
                          <td className="py-2 pr-4 text-gray-700 max-w-xs truncate">{m.concepto}</td>
                          <td className={`py-2 text-right font-medium tabular-nums ${m.tipo === 'gasto' ? 'text-red-500' : m.tipo === 'venta' ? 'text-blue-600' : 'text-green-600'}`}>
                            {m.tipo === 'gasto' ? '-' : '+'}{fmt(m.monto)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-gray-200">
                      <tr className="font-semibold">
                        <td colSpan={2} className="pt-2 text-xs text-gray-500">Neto del período</td>
                        <td className={`pt-2 text-right tabular-nums ${selected.net >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{fmt(selected.net)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  <div className="-mx-4 mt-2">
                    <Pagination page={detailPage} total={detailTotalPages} onChange={setDetailPage} />
                  </div>
                </>
              )
            })()}
          </>
        )}
      </div>
    </div>
    </>
  )
}

function ResumenTab() {
  const { plData, cashFlow } = useAccountingStore()

  if (!plData) return <div className="text-center py-12 text-gray-400">No hay datos para el período seleccionado.</div>

  const netColor = plData.netResult >= 0 ? 'green' : 'red'

  const chartData = cashFlow.slice(-30).map(d => ({
    date: d.date.slice(5),
    Ventas: Math.round(d.cashSales + d.cardSales + d.transferSales),
    Gastos: Math.round(d.expenses),
    'Otros ingresos': Math.round(d.otherIncome),
  }))

  return (
    <div className="space-y-6">
      {/* Cards principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Ventas del período"
          value={fmt(plData.totalSalesRevenue)}
          subtitle={`${plData.salesCount} ventas · ticket $${Math.round(plData.avgTicket).toLocaleString('es-AR')}`}
          icon={DollarSign}
          color="blue"
        />
        <SummaryCard
          title="Ganancia bruta"
          value={fmt(plData.grossProfit)}
          subtitle={`Margen ${plData.grossMarginPct.toFixed(1)}%`}
          icon={TrendingUp}
          color={plData.grossProfit >= 0 ? 'green' : 'red'}
        />
        <SummaryCard
          title="Gastos operativos"
          value={fmt(plData.totalExpenses)}
          subtitle={plData.expensesByCategory[0] ? `Mayor: ${plData.expensesByCategory[0].label}` : undefined}
          icon={TrendingDown}
          color="red"
        />
        <SummaryCard
          title="Resultado neto"
          value={fmt(plData.netResult)}
          subtitle={`Margen ${plData.netMarginPct.toFixed(1)}%`}
          icon={plData.netResult >= 0 ? TrendingUp : TrendingDown}
          color={netColor}
        />
      </div>

      {/* Gráfico evolución */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Evolución diaria</h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => fmt(Number(v || 0))} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Ventas" fill="#3B82F6" radius={[2, 2, 0, 0]} maxBarSize={20} />
              <Bar dataKey="Gastos" fill="#EF4444" radius={[2, 2, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Sin movimientos en el período</div>
        )}
      </div>

      {/* Gastos por categoría */}
      {plData.expensesByCategory.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Gastos por categoría</h3>
          <div className="space-y-2">
            {plData.expensesByCategory.map((cat, i) => {
              const pct = plData.totalExpenses > 0 ? (cat.total / plData.totalExpenses) * 100 : 0
              return (
                <div key={cat.category} className="flex items-center gap-3">
                  <span className="w-36 text-xs text-gray-600 truncate">{cat.label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }}
                    />
                  </div>
                  <span className="w-24 text-xs text-right font-medium text-gray-700">{fmt(cat.total)}</span>
                  <span className="w-10 text-xs text-right text-gray-400">{pct.toFixed(0)}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Estado de Resultados ────────────────────────────────────────────────
function PLTab() {
  const { plData } = useAccountingStore()

  if (!plData) return <div className="text-center py-12 text-gray-400">No hay datos para el período seleccionado.</div>

  const row = (label: string, value: number, indent = false, bold = false, color?: string) => (
    <div className={`flex justify-between items-baseline py-2 ${indent ? 'pl-6' : ''} ${bold ? 'border-t border-gray-200 pt-3 mt-1' : 'border-b border-gray-50'}`}>
      <span className={`text-sm ${bold ? 'font-bold text-gray-900' : 'text-gray-600'}`}>{label}</span>
      <span className={`text-sm font-${bold ? 'bold' : 'medium'} ${color || (value < 0 ? 'text-red-600' : 'text-gray-900')}`}>
        {fmt(value)}
      </span>
    </div>
  )

  const section = (label: string) => (
    <div className="pt-5 pb-1">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</p>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-bold text-gray-900 mb-1">Estado de Resultados</h2>
        <p className="text-xs text-gray-400 mb-6">Período seleccionado</p>

        {section('INGRESOS')}
        {row('Ventas de mercadería', plData.totalSalesRevenue, true)}
        {plData.totalOtherIncome > 0 && row('Otros ingresos', plData.totalOtherIncome, true)}
        {row('TOTAL INGRESOS', plData.totalIncome, false, true, 'text-blue-700')}

        {section('COSTO DE VENTAS')}
        {row('Costo de mercadería vendida', -plData.totalCOGS, true)}
        {row('GANANCIA BRUTA', plData.grossProfit, false, true, plData.grossProfit >= 0 ? 'text-green-700' : 'text-red-600')}

        <div className="pl-6 mt-1 mb-2">
          <span className="text-xs text-gray-400">Margen bruto: {fmtPct(plData.grossMarginPct)}</span>
        </div>

        {section('GASTOS OPERATIVOS')}
        {plData.expensesByCategory.length === 0
          ? <p className="pl-6 py-2 text-sm text-gray-400">Sin gastos registrados</p>
          : plData.expensesByCategory.map(cat => row(cat.label, -cat.total, true))
        }
        {row('TOTAL GASTOS', -plData.totalExpenses, false, true, 'text-red-600')}

        <div className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-200">
          <div className="flex justify-between items-baseline">
            <span className="text-base font-bold text-gray-900">RESULTADO NETO</span>
            <span className={`text-xl font-bold ${plData.netResult >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {fmt(plData.netResult)}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">Margen neto: {fmtPct(plData.netMarginPct)}</p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-gray-500">Ticket promedio</p>
            <p className="text-sm font-bold text-blue-700">{fmt(plData.avgTicket)}</p>
          </div>
          <div className="text-center p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">Cant. ventas</p>
            <p className="text-sm font-bold text-gray-700">{plData.salesCount.toLocaleString('es-AR')}</p>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-lg">
            <p className="text-xs text-gray-500">CMV / Ventas</p>
            <p className="text-sm font-bold text-purple-700">
              {plData.totalSalesRevenue > 0 ? ((plData.totalCOGS / plData.totalSalesRevenue) * 100).toFixed(1) : '0.0'}%
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Flujo de Caja ───────────────────────────────────────────────────────
function FlujoTab() {
  const { cashFlow } = useAccountingStore()
  const [page, setPage] = useState(1)

  const totals = useMemo(() => ({
    cashIn: cashFlow.reduce((s, d) => s + d.cashSales + d.otherIncome, 0),
    card: cashFlow.reduce((s, d) => s + d.cardSales, 0),
    transfer: cashFlow.reduce((s, d) => s + d.transferSales, 0),
    out: cashFlow.reduce((s, d) => s + d.expenses, 0),
    net: cashFlow.reduce((s, d) => s + d.net, 0),
  }), [cashFlow])

  const chartData = cashFlow.map(d => ({
    date: d.date.slice(5),
    Efectivo: Math.round(d.cashSales),
    Tarjeta: Math.round(d.cardSales),
    Transferencia: Math.round(d.transferSales),
    Gastos: Math.round(d.expenses),
  }))

  const flujoTotalPages = Math.max(1, Math.ceil(cashFlow.length / PAGE_SIZE))
  const pagedCashFlow = cashFlow.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (cashFlow.length === 0) return <div className="text-center py-12 text-gray-400">No hay movimientos en el período seleccionado.</div>

  return (
    <div className="space-y-6">
      {/* Cards resumen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title="Cobros efectivo" value={fmt(totals.cashIn)} icon={Wallet} color="green" />
        <SummaryCard title="Cobros tarjeta" value={fmt(totals.card)} icon={CreditCard} color="blue" />
        <SummaryCard title="Transferencias" value={fmt(totals.transfer)} icon={Building2} color="purple" />
        <SummaryCard title="Egresos" value={fmt(totals.out)} icon={TrendingDown} color="red" />
      </div>

      {/* Gráfico */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Flujo por día</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: any) => fmt(Number(v || 0))} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Efectivo" stackId="a" fill="#10B981" maxBarSize={24} />
            <Bar dataKey="Tarjeta" stackId="a" fill="#3B82F6" maxBarSize={24} />
            <Bar dataKey="Transferencia" stackId="a" fill="#8B5CF6" radius={[2, 2, 0, 0]} maxBarSize={24} />
            <Bar dataKey="Gastos" fill="#EF4444" radius={[2, 2, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">Fecha</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Efectivo</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Tarjeta</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Transferencia</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Otros ing.</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Egresos</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">Neto día</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pagedCashFlow.map(d => (
                <tr key={d.date} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-700">
                    {new Date(d.date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-700">{d.cashSales > 0 ? fmt(d.cashSales) : '-'}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{d.cardSales > 0 ? fmt(d.cardSales) : '-'}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{d.transferSales > 0 ? fmt(d.transferSales) : '-'}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{d.otherIncome > 0 ? fmt(d.otherIncome) : '-'}</td>
                  <td className="px-4 py-2 text-right text-red-500">{d.expenses > 0 ? fmt(d.expenses) : '-'}</td>
                  <td className={`px-4 py-2 text-right font-semibold ${d.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(d.net)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td className="px-4 py-2 text-xs font-bold text-gray-700">TOTAL</td>
                <td className="px-4 py-2 text-right text-xs font-bold">{fmt(cashFlow.reduce((s, d) => s + d.cashSales, 0))}</td>
                <td className="px-4 py-2 text-right text-xs font-bold">{fmt(cashFlow.reduce((s, d) => s + d.cardSales, 0))}</td>
                <td className="px-4 py-2 text-right text-xs font-bold">{fmt(cashFlow.reduce((s, d) => s + d.transferSales, 0))}</td>
                <td className="px-4 py-2 text-right text-xs font-bold">{fmt(cashFlow.reduce((s, d) => s + d.otherIncome, 0))}</td>
                <td className="px-4 py-2 text-right text-xs font-bold text-red-600">{fmt(cashFlow.reduce((s, d) => s + d.expenses, 0))}</td>
                <td className={`px-4 py-2 text-right text-xs font-bold ${totals.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(totals.net)}</td>
              </tr>
            </tfoot>
          </table>
          <Pagination page={page} total={flujoTotalPages} onChange={setPage} />
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Libro IVA ───────────────────────────────────────────────────────────
function LibroIVATab() {
  const {
    libroIVA, totalLibroNeto, totalLibroIVA, totalLibroImporte,
    isLoadingLibro, fetchLibroIVA, startDate, endDate
  } = useAccountingStore()

  const { organization } = useAuthStore()
  const [page, setPage] = useState(1)

  const libroTotalPages = Math.max(1, Math.ceil(libroIVA.length / PAGE_SIZE))
  const pagedLibro = libroIVA.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => {
    fetchLibroIVA(startDate, endDate)
  }, [startDate.toISOString(), endDate.toISOString()])

  const exportCSV = () => {
    const rows = libroIVA.map(e => ({
      Fecha: e.fecha,
      Tipo: e.tipo_label,
      'Punto de Venta': String(e.punto_venta).padStart(5, '0'),
      Número: String(e.numero).padStart(8, '0'),
      'CUIT Receptor': e.cuit_receptor || '',
      'Razón Social': e.razon_social || '',
      'Importe Neto': e.importe_neto.toFixed(2),
      'Importe IVA': e.importe_iva.toFixed(2),
      'Importe Total': e.importe_total.toFixed(2),
      CAE: e.cae || '',
    }))
    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `libro_iva_ventas_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!organization?.fiscal_enabled) {
    return (
      <div className="text-center py-16">
        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Facturación electrónica no habilitada</p>
        <p className="text-xs text-gray-400 mt-1">El Libro IVA requiere tener AFIP configurado en Configuración.</p>
      </div>
    )
  }

  if (isLoadingLibro) {
    return <div className="flex items-center justify-center py-16"><RefreshCw className="w-6 h-6 text-blue-500 animate-spin" /></div>
  }

  if (libroIVA.length === 0) {
    return (
      <div className="text-center py-16">
        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No hay comprobantes fiscales en el período</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Neto (sin IVA)</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{fmt(totalLibroNeto)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">IVA Facturado</p>
          <p className="text-xl font-bold text-blue-700 mt-1">{fmt(totalLibroIVA)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Facturado</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{fmt(totalLibroImporte)}</p>
        </div>
      </div>

      {/* Export */}
      <div className="flex justify-end">
        <button onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-gray-300 hover:bg-gray-50">
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">Fecha</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">Tipo</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">Número</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">CUIT</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">Receptor</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Neto</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">IVA</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pagedLibro.map(e => (
                <tr key={e.id} className="hover:bg-gray-50 text-xs">
                  <td className="px-3 py-2 text-gray-700">{e.fecha}</td>
                  <td className="px-3 py-2">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">{e.tipo_label}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-600 font-mono">
                    {String(e.punto_venta).padStart(5, '0')}-{String(e.numero).padStart(8, '0')}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{e.cuit_receptor || '-'}</td>
                  <td className="px-3 py-2 text-gray-600 max-w-[150px] truncate">{e.razon_social || 'Consumidor Final'}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{fmt(e.importe_neto)}</td>
                  <td className="px-3 py-2 text-right text-blue-600">{fmt(e.importe_iva)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmt(e.importe_total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t-2 border-gray-200">
              <tr>
                <td colSpan={5} className="px-3 py-2 text-xs font-bold text-gray-700">
                  TOTAL ({libroIVA.length} comprobantes)
                </td>
                <td className="px-3 py-2 text-right text-xs font-bold">{fmt(totalLibroNeto)}</td>
                <td className="px-3 py-2 text-right text-xs font-bold text-blue-600">{fmt(totalLibroIVA)}</td>
                <td className="px-3 py-2 text-right text-xs font-bold">{fmt(totalLibroImporte)}</td>
              </tr>
            </tfoot>
          </table>
          <Pagination page={page} total={libroTotalPages} onChange={setPage} />
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Compras ─────────────────────────────────────────────────────────────
function ComprasTab() {
  const { purchases, totalPurchasesAmount, totalPurchasesQty, isLoadingPurchases, fetchPurchases, startDate, endDate } = useAccountingStore()
  const [search, setSearch] = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    fetchPurchases(startDate, endDate)
  }, [startDate.toISOString(), endDate.toISOString()])

  const suppliers = useMemo(() => {
    const s = new Set(purchases.map(p => p.supplier_name).filter(Boolean))
    return Array.from(s).sort() as string[]
  }, [purchases])

  const filtered = useMemo(() => {
    return purchases.filter(p => {
      const matchSearch = !search || p.product_name.toLowerCase().includes(search.toLowerCase()) || (p.barcode || '').includes(search)
      const matchSupplier = !filterSupplier || p.supplier_name === filterSupplier
      return matchSearch && matchSupplier
    })
  }, [purchases, search, filterSupplier])

  useEffect(() => { setPage(1) }, [search, filterSupplier])

  const comprasTotalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pagedFiltered = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const bySupplier = useMemo(() => {
    const map = new Map<string, { name: string; total: number; qty: number; count: number }>()
    purchases.forEach(p => {
      const key = p.supplier_name || 'Sin proveedor'
      const prev = map.get(key) || { name: key, total: 0, qty: 0, count: 0 }
      map.set(key, { ...prev, total: prev.total + p.total_cost, qty: prev.qty + p.quantity, count: prev.count + 1 })
    })
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [purchases])

  const exportCSV = () => {
    const rows = filtered.map(p => ({
      Fecha: new Date(p.fecha).toLocaleDateString('es-AR'),
      Producto: p.product_name,
      Código: p.barcode || '',
      Proveedor: p.supplier_name || 'Sin proveedor',
      Sucursal: p.branch_name,
      Cantidad: p.quantity,
      'Costo unitario': p.unit_cost.toFixed(2),
      'Total pagado': p.total_cost.toFixed(2),
      Notas: p.notes || '',
      Usuario: p.created_by_name || '',
    }))
    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `compras_${startDate.toISOString().split('T')[0]}_${endDate.toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoadingPurchases) return (
    <div className="flex items-center justify-center py-16">
      <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
    </div>
  )

  if (purchases.length === 0) return (
    <div className="text-center py-16">
      <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
      <p className="text-gray-500">No hay compras registradas en el período</p>
      <p className="text-xs text-gray-400 mt-1">Las compras se registran desde Productos → Movimiento → Compra</p>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Cards resumen */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total comprado</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmt(totalPurchasesAmount)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Unidades ingresadas</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalPurchasesQty.toLocaleString('es-AR')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Proveedores distintos</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{bySupplier.length}</p>
        </div>
      </div>

      {/* Por proveedor */}
      {bySupplier.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Por proveedor</h3>
          <div className="space-y-2">
            {bySupplier.map((s, i) => {
              const pct = totalPurchasesAmount > 0 ? (s.total / totalPurchasesAmount) * 100 : 0
              return (
                <div key={s.name} className="flex items-center gap-3">
                  <button
                    onClick={() => setFilterSupplier(filterSupplier === s.name ? '' : s.name)}
                    className={`w-36 text-xs text-left truncate font-medium transition-colors ${filterSupplier === s.name ? 'text-blue-600' : 'text-gray-600 hover:text-blue-500'}`}
                  >
                    {s.name}
                  </button>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-28 text-xs text-right font-medium text-gray-700">{fmt(s.total)}</span>
                  <span className="w-16 text-xs text-right text-gray-400">{s.count} compra{s.count !== 1 ? 's' : ''}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Filtros + tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar producto o código..."
              className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {filterSupplier && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
              <Building2 className="w-3 h-3" />
              {filterSupplier}
              <button onClick={() => setFilterSupplier('')} className="ml-1 hover:text-blue-900">×</button>
            </div>
          )}
          <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">Fecha</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">Producto</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">Proveedor</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Cant.</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Costo unit.</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500">Total pagado</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500">Notas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pagedFiltered.map(p => (
                <tr key={p.id} className="hover:bg-gray-50 text-xs">
                  <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">
                    {new Date(p.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                    <span className="ml-1 text-gray-400">
                      {new Date(p.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-medium text-gray-800">{p.product_name}</span>
                    {p.barcode && <span className="ml-1.5 text-gray-400 font-mono">{p.barcode}</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {p.supplier_name
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                          <Building2 className="w-3 h-3" />{p.supplier_name}
                        </span>
                      : <span className="text-gray-400">Sin proveedor</span>
                    }
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium text-gray-700">{p.quantity}</td>
                  <td className="px-3 py-2.5 text-right text-gray-600">{fmt(p.unit_cost)}</td>
                  <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{fmt(p.total_cost)}</td>
                  <td className="px-3 py-2.5 text-gray-400 max-w-[140px] truncate">{p.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-xs font-bold text-gray-700">
                    {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
                    {filtered.length !== purchases.length && ` (de ${purchases.length})`}
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-bold">{filtered.reduce((s, p) => s + p.quantity, 0)}</td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right text-xs font-bold">{fmt(filtered.reduce((s, p) => s + p.total_cost, 0))}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
          <Pagination page={page} total={comprasTotalPages} onChange={setPage} />
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AccountingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('resumen')
  const { isLoading, error, plData, startDate, endDate, fetchAccountingData, setDateRange } = useAccountingStore()
  const { organization } = useAuthStore()

  useEffect(() => {
    fetchAccountingData(startDate, endDate)
  }, [])

  const handleDateChange = (start: Date, end: Date) => {
    setDateRange(start, end)
    fetchAccountingData(start, end)
  }

  const tabs: { id: Tab; label: string; icon: typeof DollarSign }[] = [
    { id: 'resumen', label: 'Resumen', icon: DollarSign },
    { id: 'pl', label: 'Estado de Resultados', icon: TrendingUp },
    { id: 'flujo', label: 'Flujo de Caja', icon: Wallet },
    { id: 'gastos', label: 'Gastos y Pagos', icon: BookOpen },
    { id: 'cuentas', label: 'Cuentas', icon: Building2 },
    { id: 'compras', label: 'Compras', icon: ShoppingCart },
    ...(organization?.fiscal_enabled ? [{ id: 'libro' as Tab, label: 'Libro IVA', icon: FileText }] : []),
  ]

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Contabilidad</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {startDate.toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })} —{' '}
              {endDate.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <DateRangePicker start={startDate} end={endDate} onApply={handleDateChange} />
            <button
              onClick={() => fetchAccountingData(startDate, endDate)}
              disabled={isLoading}
              className="p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 border-b border-gray-100 -mb-4 -mx-6 px-6">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            Error al cargar datos: {error}
          </div>
        )}
        {isLoading && !plData ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
          </div>
        ) : (
          <>
            {activeTab === 'resumen' && <ResumenTab />}
            {activeTab === 'pl' && <PLTab />}
            {activeTab === 'flujo' && <FlujoTab />}
            {activeTab === 'gastos' && <GastosTab />}
            {activeTab === 'cuentas' && <CuentasTab />}
            {activeTab === 'compras' && <ComprasTab />}
            {activeTab === 'libro' && <LibroIVATab />}
          </>
        )}
      </div>
    </div>
  )
}

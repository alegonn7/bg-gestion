import { useEffect, useState } from 'react'
import { FileText, CheckCircle, AlertTriangle, XCircle, RefreshCw } from 'lucide-react'
import { useFiscalStore, TIPO_COMPROBANTE_LABELS } from '@/store/fiscal'
import FiscalSetupSection from '@/components/FiscalSetupSection'

export default function FiscalPage() {
  const { config, comprobantes, fetchComprobantes } = useFiscalStore()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (config?.fiscal_enabled) {
      handleRefresh()
    }
  }, [config?.fiscal_enabled])

  const handleRefresh = async () => {
    setLoading(true)
    await fetchComprobantes(200)
    setLoading(false)
  }

  const formatCurrency = (v: number | null) =>
    v == null ? '-' : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v)

  const formatNumero = (puntoVenta: number, numero: number) =>
    `${String(puntoVenta).padStart(4, '0')}-${String(numero).padStart(8, '0')}`

  const resultadoLabel = (r: string) => {
    if (r === 'A') return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full"><CheckCircle className="w-3 h-3" />Aprobado</span>
    if (r === 'O') return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full"><AlertTriangle className="w-3 h-3" />Observado</span>
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full"><XCircle className="w-3 h-3" />Rechazado</span>
  }

  const tipoColor: Record<number, string> = {
    1: 'bg-blue-100 text-blue-700',
    2: 'bg-sky-100 text-sky-700',
    3: 'bg-orange-100 text-orange-700',
    6: 'bg-indigo-100 text-indigo-700',
    7: 'bg-sky-100 text-sky-700',
    8: 'bg-orange-100 text-orange-700',
    11: 'bg-purple-100 text-purple-700',
    12: 'bg-sky-100 text-sky-700',
    13: 'bg-orange-100 text-orange-700',
  }

  // KPIs del historial
  const aprobados = comprobantes.filter(c => c.resultado === 'A')
  const totalFacturado = aprobados.reduce((s, c) => s + (c.importe_total ?? 0), 0)
  const thisMonth = new Date()
  thisMonth.setDate(1)
  thisMonth.setHours(0, 0, 0, 0)
  const estesMes = aprobados.filter(c => new Date(c.created_at) >= thisMonth).length

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Facturación Electrónica ARCA</h1>
          <p className="text-sm text-gray-500 mt-1">Configuración y comprobantes emitidos</p>
        </div>
        {config?.fiscal_enabled && (
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        )}
      </div>

      {/* Configuración (reutiliza el componente de Settings) */}
      <FiscalSetupSection />

      {/* Si no está habilitado, termina acá */}
      {!config?.fiscal_enabled && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Configurá la facturación electrónica arriba para ver el historial de comprobantes.</p>
        </div>
      )}

      {/* KPIs */}
      {config?.fiscal_enabled && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-500 mb-1">Comprobantes aprobados</p>
            <p className="text-2xl font-bold text-gray-900">{aprobados.length}</p>
            <p className="text-xs text-gray-400 mt-1">Últimos 200 registros</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-500 mb-1">Este mes</p>
            <p className="text-2xl font-bold text-indigo-700">{estesMes}</p>
            <p className="text-xs text-gray-400 mt-1">comprobantes emitidos</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-500 mb-1">Total facturado</p>
            <p className="text-2xl font-bold text-green-700">{formatCurrency(totalFacturado)}</p>
            <p className="text-xs text-gray-400 mt-1">comprobantes aprobados</p>
          </div>
        </div>
      )}

      {/* Tabla de comprobantes */}
      {config?.fiscal_enabled && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <h2 className="text-base font-semibold text-gray-900">Historial de Comprobantes</h2>
            <span className="text-sm text-gray-400">{comprobantes.length} registros</span>
          </div>

          {comprobantes.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No hay comprobantes emitidos todavía.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Número</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Receptor</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">CAE</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {comprobantes.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tipoColor[c.tipo_cbte] ?? 'bg-gray-100 text-gray-600'}`}>
                          {TIPO_COMPROBANTE_LABELS[c.tipo_cbte] ?? `Tipo ${c.tipo_cbte}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-700">
                        {formatNumero(c.punto_venta, c.numero)}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {c.fecha_emision}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {c.cuit_receptor
                          ? <span>{c.cuit_receptor}{c.razon_social_receptor ? ` · ${c.razon_social_receptor}` : ''}</span>
                          : <span className="text-gray-400">CF</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {formatCurrency(c.importe_total)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        {c.cae || '-'}
                      </td>
                      <td className="px-4 py-3">
                        {resultadoLabel(c.resultado)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

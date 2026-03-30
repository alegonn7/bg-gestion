import { useEffect, useState } from 'react'
import { FileText, CheckCircle, AlertTriangle, Loader2, ChevronDown, ChevronUp, Trash2, Edit2, Copy } from 'lucide-react'
import { useFiscalStore } from '@/store/fiscal'

const CONDICIONES_IVA = [
  { value: 'RI', label: 'Responsable Inscripto' },
  { value: 'Monotributo', label: 'Monotributista' },
  { value: 'CF', label: 'Consumidor Final / Exento' },
]

const ACTIVIDADES_COMUNES = [
  { code: 471120, label: '471120 — Supermercado / Almacén (+300m²)' },
  { code: 471910, label: '471910 — Almacén / Despensa (-300m²)' },
  { code: 476310, label: '476310 — Ferretería' },
  { code: 477110, label: '477110 — Farmacia' },
  { code: 561010, label: '561010 — Restaurante / Parrilla' },
  { code: 561090, label: '561090 — Comidas rápidas / Kiosco' },
  { code: 477210, label: '477210 — Indumentaria / Textil' },
  { code: 475400, label: '475400 — Muebles / Decoración' },
]

export default function FiscalSetupSection() {
  const { config, developerCuit, isLoading, fetchConfig, saveConfig, deleteConfig } = useFiscalStore()
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)

  // Campos del formulario
  const [cuit, setCuit] = useState('')
  const [razonSocial, setRazonSocial] = useState('')
  const [condicionIva, setCondicionIva] = useState('RI')
  const [puntoVenta, setPuntoVenta] = useState(1)
  const [actividadAfip, setActividadAfip] = useState(471120)
  const [actividadCustom, setActividadCustom] = useState(false)

  useEffect(() => { fetchConfig() }, [])

  useEffect(() => {
    if (config) {
      setCuit(config.cuit || '')
      setRazonSocial(config.razon_social || '')
      setCondicionIva(config.condicion_iva || 'RI')
      setPuntoVenta(config.punto_venta || 1)
      setActividadAfip(config.actividad_afip || 471120)
    }
  }, [config])

  const clearMessages = () => { setError(null); setOk(null) }

  const handleSave = async () => {
    clearMessages()
    const cuitClean = cuit.replace(/-/g, '')
    if (cuitClean.length !== 11) { setError('CUIT inválido (debe tener 11 dígitos)'); return }
    if (!razonSocial.trim()) { setError('Ingresá la razón social'); return }

    setSaving(true)
    try {
      await saveConfig({ cuit: cuitClean, razonSocial: razonSocial.trim(), condicionIva, puntoVenta, actividadAfip })
      setEditing(false)
      setOk('Configuración guardada')
      setTimeout(() => setOk(null), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setSaving(true)
    try {
      await deleteConfig()
      setConfirmDelete(false)
      setEditing(false)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleCopyCuit = async () => {
    if (!developerCuit) return
    await navigator.clipboard.writeText(developerCuit)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isActive = config?.fiscal_enabled

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
      {/* Header */}
      <button className="w-full flex items-center justify-between" onClick={() => setExpanded(v => !v)}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <FileText className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="text-left">
            <h2 className="text-lg font-semibold text-gray-900">Facturación Electrónica ARCA</h2>
            <p className="text-sm text-gray-500">
              {isActive
                ? `Activo · CUIT ${config.cuit} · Punto de venta ${config.punto_venta}`
                : 'No configurado — opcional'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isActive && <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">Activo</span>}
          {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="mt-5 space-y-5">

          {/* Mensajes */}
          {ok && (
            <div className="flex items-center gap-2 text-green-700 bg-green-50 px-3 py-2 rounded-lg text-sm">
              <CheckCircle className="w-4 h-4" />{ok}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-red-700 bg-red-50 px-3 py-2 rounded-lg text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}

          {/* ─── ESTADO: ACTIVO (solo lectura) ───────────────────────────── */}
          {isActive && !editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-gray-500 text-xs mb-1">CUIT</p><p className="font-medium">{config.cuit}</p></div>
                <div><p className="text-gray-500 text-xs mb-1">Razón Social</p><p className="font-medium">{config.razon_social}</p></div>
                <div><p className="text-gray-500 text-xs mb-1">Condición IVA</p><p className="font-medium">{config.condicion_iva}</p></div>
                <div><p className="text-gray-500 text-xs mb-1">Punto de Venta</p><p className="font-medium">{String(config.punto_venta).padStart(4, '0')}</p></div>
              </div>

              <div className="flex gap-3 flex-wrap pt-1">
                <button
                  onClick={() => { setEditing(true); clearMessages() }}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg border border-indigo-200"
                >
                  <Edit2 className="w-4 h-4" />Editar datos
                </button>

                {confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-600 font-medium">¿Deshabilitar facturación?</span>
                    <button onClick={handleDelete} disabled={saving} className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:opacity-50">
                      {saving ? 'Deshabilitando...' : 'Confirmar'}
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs rounded-lg">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded-lg border border-red-200">
                    <Trash2 className="w-4 h-4" />Deshabilitar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ─── FORMULARIO (alta o edición) ─────────────────────────────── */}
          {(!isActive || editing) && (
            <div className="space-y-4">

              {/* Instrucción: autorizar CUIT del desarrollador */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
                <p className="text-sm font-semibold text-blue-800">Paso 1 — Autorizar BG Gestión en ARCA (una sola vez)</p>
                <ol className="text-sm text-blue-700 list-decimal ml-4 space-y-1.5">
                  <li>Entrá a <strong>arca.gob.ar</strong> con tu CUIT y Clave Fiscal nivel 3</li>
                  <li>Buscá el servicio <strong>"Administrador de Relaciones de Clave Fiscal"</strong></li>
                  <li>Hacé clic en <strong>"Nueva Relación"</strong></li>
                  <li>Hacé clic en <strong>"Buscar"</strong></li>
                  <li>Seleccioná <strong>"ARCA"</strong></li>
                  <li>Seleccioná <strong>"WebServices"</strong></li>
                  <li>Elegí <strong>"Factura Electrónica con Detalle - MTXCA"</strong> y confirmá</li>
                  <li>
                    En el campo <strong>"CUIT/CUIL/CDI Usuario"</strong> ingresá el CUIT de BG Gestión y hacé clic en <strong>"Buscar"</strong>:
                    {developerCuit && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <code className="flex-1 bg-white border border-blue-200 rounded px-3 py-1.5 text-sm font-mono text-blue-900 select-all">
                          {developerCuit}
                        </code>
                        <button
                          onClick={handleCopyCuit}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg border border-blue-200"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          {copied ? 'Copiado' : 'Copiar'}
                        </button>
                      </div>
                    )}
                  </li>
                  <li>Seleccioná el computador fiscal <strong>"bgGestion2025"</strong> que aparece y hacé clic en <strong>"Confirmar"</strong></li>
                </ol>
                <p className="text-xs text-blue-600 bg-blue-100 rounded px-3 py-2">
                  Una vez hecho esto, completá tus datos abajo y hacé clic en "Activar facturación".
                </p>
              </div>

              <FiscalDataForm
                cuit={cuit} setCuit={setCuit}
                razonSocial={razonSocial} setRazonSocial={setRazonSocial}
                condicionIva={condicionIva} setCondicionIva={setCondicionIva}
                puntoVenta={puntoVenta} setPuntoVenta={setPuntoVenta}
                actividadAfip={actividadAfip} setActividadAfip={setActividadAfip}
                actividadCustom={actividadCustom} setActividadCustom={setActividadCustom}
              />

              <div className="flex gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving || isLoading}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {saving ? 'Guardando...' : isActive ? 'Guardar cambios' : 'Activar facturación'}
                </button>
                {editing && (
                  <button
                    onClick={() => { setEditing(false); clearMessages() }}
                    className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          )}

        </div>
      )}
    </section>
  )
}

// ─── Subcomponente: formulario de datos fiscales ─────────────────────────────

function FiscalDataForm({ cuit, setCuit, razonSocial, setRazonSocial, condicionIva, setCondicionIva, puntoVenta, setPuntoVenta, actividadAfip, setActividadAfip, actividadCustom, setActividadCustom }: {
  cuit: string; setCuit: (v: string) => void
  razonSocial: string; setRazonSocial: (v: string) => void
  condicionIva: string; setCondicionIva: (v: string) => void
  puntoVenta: number; setPuntoVenta: (v: number) => void
  actividadAfip: number; setActividadAfip: (v: number) => void
  actividadCustom: boolean; setActividadCustom: (v: boolean) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">CUIT *</label>
        <input type="text" value={cuit} onChange={e => setCuit(e.target.value)} placeholder="20123456789"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Razón Social *</label>
        <input type="text" value={razonSocial} onChange={e => setRazonSocial(e.target.value)} placeholder="Mi Negocio"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Condición IVA *</label>
        <select value={condicionIva} onChange={e => setCondicionIva(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
          {CONDICIONES_IVA.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Punto de Venta *</label>
        <input type="number" min={1} value={puntoVenta} onChange={e => setPuntoVenta(Number(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
      </div>
      <div className="col-span-2">
        <label className="block text-sm font-medium text-gray-700 mb-1">Actividad ARCA *</label>
        {!actividadCustom ? (
          <select
            value={ACTIVIDADES_COMUNES.find(a => a.code === actividadAfip) ? actividadAfip : 'otro'}
            onChange={e => {
              if (e.target.value === 'otro') { setActividadCustom(true) }
              else { setActividadAfip(Number(e.target.value)) }
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            {ACTIVIDADES_COMUNES.map(a => <option key={a.code} value={a.code}>{a.label}</option>)}
            <option value="otro">Otra actividad (ingresá el código)</option>
          </select>
        ) : (
          <div className="flex gap-2">
            <input type="number" value={actividadAfip} onChange={e => setActividadAfip(Number(e.target.value))} placeholder="471120"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            <button onClick={() => setActividadCustom(false)} className="px-3 py-2 text-xs text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200">
              Ver lista
            </button>
          </div>
        )}
        <p className="text-xs text-gray-400 mt-1">Lo encontrás en tu constancia de inscripción en ARCA.</p>
      </div>
    </div>
  )
}

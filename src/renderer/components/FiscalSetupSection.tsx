import { useEffect, useRef, useState } from 'react'
import { FileText, CheckCircle, AlertTriangle, Loader2, ChevronDown, ChevronUp, Trash2, Edit2, Circle, XCircle, FlaskConical, ShieldCheck } from 'lucide-react'
import { useFiscalStore, type AltaFiscal, type FiscalConfig, type SaveConfigParams } from '@/store/fiscal'

const CONDICIONES_IVA = [
  { value: 'Monotributo', label: 'Monotributista' },
  { value: 'RI', label: 'Responsable Inscripto' },
  { value: 'Exento', label: 'IVA Exento' },
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

// Pasos del alta tal como los ve el cliente (en modo prueba no hace falta el punto de venta)
const PASOS_ALTA = [
  { orden: 0, label: 'Crear tu certificado digital', soloProduccion: false },
  { orden: 1, label: 'Autorizarlo para facturar', soloProduccion: false },
  { orden: 2, label: 'Preparar tu punto de venta', soloProduccion: true },
]
const ORDEN_PASO: Record<AltaFiscal['paso'], number> = {
  certificado: 0, autorizacion: 1, puntos_venta: 2, punto_venta: 2, listo: 3,
}
const INTERVALO_ALTA_MS = 4000

const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none'

export default function FiscalSetupSection() {
  const {
    config, alta, ambienteNuevo, isLoading,
    fetchConfig, iniciarAlta, avanzarAlta, reintentarAlta, cancelarAlta, usarCuitPrueba, saveConfig, deleteConfig,
  } = useFiscalStore()
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  // La clave fiscal solo vive en memoria mientras dura el alta: nunca se guarda
  const [clave, setClave] = useState('')

  useEffect(() => { fetchConfig() }, [])

  const conectado = !!config?.fiscal_enabled && !!config?.conectado
  const enCurso = alta?.estado === 'en_curso'
  const altaConError = alta?.estado === 'error'
  const esPrueba = (conectado ? config?.ambiente : ambienteNuevo) === 'dev'

  // Mientras el alta está en curso, se consulta el avance cada pocos segundos
  useEffect(() => {
    if (!enCurso || !clave) return
    const id = setInterval(() => {
      avanzarAlta(clave).catch(err => setError(err.message))
    }, INTERVALO_ALTA_MS)
    return () => clearInterval(id)
  }, [enCurso, clave])

  // Al terminar el alta se borra la clave de memoria y se avisa
  const estabaConectado = useRef(conectado)
  useEffect(() => {
    if (conectado && !estabaConectado.current) {
      setClave('')
      setOk('¡Listo! Ya podés emitir facturas.')
      setTimeout(() => setOk(null), 5000)
    }
    estabaConectado.current = conectado
  }, [conectado])

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    setOk(null)
    setBusy(true)
    try {
      await fn()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const estadoResumen = conectado
    ? `Conectado · CUIT ${config?.cuit} · Punto de venta ${String(config?.punto_venta).padStart(4, '0')}`
    : enCurso
    ? 'Conectando con ARCA…'
    : altaConError
    ? 'El alta en ARCA no se completó'
    : 'No configurado — opcional'

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
            <p className="text-sm text-gray-500">{estadoResumen}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {conectado && (esPrueba
            ? <span className="px-2.5 py-1 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">Modo prueba</span>
            : <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">Activo</span>)}
          {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
        </div>
      </button>

      {expanded && (
        <div className="mt-5 space-y-5">
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
          {esPrueba && (
            <div className="flex items-start gap-2 text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg text-sm">
              <FlaskConical className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span><strong>Modo prueba:</strong> todo lo que factures es de prueba y no tiene validez fiscal.</span>
            </div>
          )}

          {/* ─── CONECTADO ─────────────────────────────────────────────── */}
          {conectado && !editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-gray-500 text-xs mb-1">CUIT</p><p className="font-medium">{config?.cuit}</p></div>
                <div><p className="text-gray-500 text-xs mb-1">Razón Social</p><p className="font-medium">{config?.razon_social}</p></div>
                <div><p className="text-gray-500 text-xs mb-1">Condición IVA</p><p className="font-medium">{CONDICIONES_IVA.find(c => c.value === config?.condicion_iva)?.label ?? config?.condicion_iva}</p></div>
                <div><p className="text-gray-500 text-xs mb-1">Punto de Venta</p><p className="font-medium">{String(config?.punto_venta).padStart(4, '0')}</p></div>
                <div><p className="text-gray-500 text-xs mb-1">Domicilio comercial</p><p className="font-medium">{config?.domicilio_comercial || '—'}</p></div>
                <div><p className="text-gray-500 text-xs mb-1">Ingresos Brutos</p><p className="font-medium">{config?.ingresos_brutos || '—'}</p></div>
                <div><p className="text-gray-500 text-xs mb-1">Inicio de actividades</p><p className="font-medium">{config?.inicio_actividades?.split('-').reverse().join('/') || '—'}</p></div>
              </div>

              {(!config?.domicilio_comercial || !config?.ingresos_brutos || !config?.inicio_actividades) && (
                <p className="text-sm text-blue-800 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  Completá el domicilio comercial, Ingresos Brutos y el inicio de actividades en <strong>Editar datos</strong>: salen impresos en las facturas.
                </p>
              )}

              {config?.ambiente === 'dev' && ambienteNuevo === 'prod' && (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Estás conectado en modo prueba. Desconectá y volvé a conectar para emitir facturas reales.
                </p>
              )}

              <div className="flex gap-3 flex-wrap pt-1">
                <button
                  onClick={() => { setEditing(true); setError(null); setOk(null) }}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg border border-indigo-200"
                >
                  <Edit2 className="w-4 h-4" />Editar datos
                </button>

                {confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-600 font-medium">¿Desconectar de ARCA?</span>
                    <button
                      onClick={() => run(async () => { await deleteConfig(); setConfirmDelete(false) })}
                      disabled={busy}
                      className="px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      {busy ? 'Desconectando...' : 'Confirmar'}
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs rounded-lg">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 px-4 py-2 text-sm bg-red-50 hover:bg-red-100 text-red-600 rounded-lg border border-red-200">
                    <Trash2 className="w-4 h-4" />Desconectar
                  </button>
                )}
              </div>
            </div>
          )}

          {conectado && editing && (
            <EditarDatosForm
              initial={config!}
              busy={busy}
              onCancel={() => setEditing(false)}
              onSave={(params) => run(async () => {
                await saveConfig(params)
                setEditing(false)
                setOk('Datos guardados')
              })}
            />
          )}

          {/* ─── ALTA EN CURSO O CON ERROR ─────────────────────────────── */}
          {!conectado && alta && (enCurso || altaConError) && (
            <ProgresoAlta
              alta={alta}
              esPrueba={esPrueba}
              clave={clave}
              busy={busy}
              onClave={setClave}
              onReintentar={(puntoVenta) => run(() => reintentarAlta(clave, puntoVenta))}
              onCancelar={() => run(cancelarAlta)}
            />
          )}

          {/* ─── ALTA NUEVA ────────────────────────────────────────────── */}
          {!conectado && !enCurso && !altaConError && (
            <AltaForm
              initial={config}
              esPrueba={esPrueba}
              busy={busy || isLoading}
              onSubmit={(params) => run(async () => {
                setClave(params.clave)
                await iniciarAlta(params)
              })}
              onUsarCuitPrueba={(condicionIva) => run(() => usarCuitPrueba(condicionIva))}
            />
          )}
        </div>
      )}
    </section>
  )
}

// ─── Formulario del alta ─────────────────────────────────────────────────────

function AltaForm({ initial, esPrueba, busy, onSubmit, onUsarCuitPrueba }: {
  initial: { cuit: string | null; razon_social: string | null; condicion_iva: string | null } | null
  esPrueba: boolean
  busy: boolean
  onSubmit: (params: {
    cuit: string; usuario?: string; clave: string; razonSocial: string; condicionIva: string; puntoVenta: number | null
  }) => void
  onUsarCuitPrueba: (condicionIva: string) => void
}) {
  const [cuit, setCuit] = useState(initial?.cuit || '')
  const [razonSocial, setRazonSocial] = useState(initial?.razon_social || '')
  const [condicionIva, setCondicionIva] = useState(initial?.condicion_iva || 'Monotributo')
  const [esSociedad, setEsSociedad] = useState(false)
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [puntoVenta, setPuntoVenta] = useState('')
  const [acepto, setAcepto] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = () => {
    setError(null)
    const cuitLimpio = cuit.replace(/\D/g, '')
    if (cuitLimpio.length !== 11) return setError('El CUIT tiene que tener 11 dígitos')
    if (!razonSocial.trim()) return setError('Ingresá la razón social')
    if (esSociedad && usuario.replace(/\D/g, '').length !== 11) return setError('Ingresá el CUIT/CUIL de quien entra a ARCA (11 dígitos)')
    if (!clave) return setError('Ingresá la clave fiscal')
    if (!acepto) return setError('Tenés que aceptar el uso de la clave fiscal para continuar')
    onSubmit({
      cuit: cuitLimpio,
      usuario: esSociedad ? usuario.replace(/\D/g, '') : undefined,
      clave,
      razonSocial: razonSocial.trim(),
      condicionIva,
      puntoVenta: Number(puntoVenta) || null,
    })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Conectamos tu negocio con ARCA automáticamente: creamos tu certificado digital, lo autorizamos para facturar
        y preparamos tu punto de venta. Solo necesitás tu CUIT y tu clave fiscal.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">CUIT del negocio *</label>
          <input type="text" value={cuit} onChange={e => setCuit(e.target.value)} placeholder="20123456789" className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Razón Social *</label>
          <input type="text" value={razonSocial} onChange={e => setRazonSocial(e.target.value)} placeholder="Mi Negocio" className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Condición frente al IVA *</label>
          <select value={condicionIva} onChange={e => setCondicionIva(e.target.value)} className={inputClass}>
            {CONDICIONES_IVA.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Punto de venta (opcional)</label>
          <input type="number" min={1} value={puntoVenta} onChange={e => setPuntoVenta(e.target.value)} placeholder="Automático" className={inputClass} />
        </div>
      </div>
      <p className="text-xs text-gray-400 -mt-2">
        Si dejás el punto de venta vacío, usamos uno de facturación electrónica que ya tengas o creamos uno nuevo.
      </p>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={esSociedad} onChange={e => setEsSociedad(e.target.checked)} />
        Es una sociedad (SRL, SA…): a ARCA entra otra persona con su propio CUIT/CUIL
      </label>
      {esSociedad && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">CUIT/CUIL de quien entra a ARCA *</label>
          <input type="text" value={usuario} onChange={e => setUsuario(e.target.value)} placeholder="20123456789" className={inputClass} />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Clave fiscal *</label>
        <input type="password" value={clave} onChange={e => setClave(e.target.value)} autoComplete="off" className={inputClass} />
      </div>

      <label className="flex items-start gap-2 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
        <input type="checkbox" className="mt-0.5" checked={acepto} onChange={e => setAcepto(e.target.checked)} />
        <span>
          <ShieldCheck className="w-4 h-4 inline -mt-0.5 mr-1 text-indigo-600" />
          Autorizo a BG Gestión a usar mi clave fiscal, a través de Afip SDK, solo para configurar la facturación en ARCA.
          La clave no se guarda.
        </span>
      </label>

      {error && (
        <div className="flex items-center gap-2 text-red-700 bg-red-50 px-3 py-2 rounded-lg text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />{error}
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <button
          onClick={handleSubmit}
          disabled={busy}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Conectar con ARCA
        </button>
        {esPrueba && (
          <button
            onClick={() => onUsarCuitPrueba(condicionIva)}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 text-sm rounded-lg border border-amber-200 disabled:opacity-50"
          >
            <FlaskConical className="w-4 h-4" />
            Probar sin clave fiscal
          </button>
        )}
      </div>
      {esPrueba && (
        <p className="text-xs text-gray-500">
          "Probar sin clave fiscal" usa un CUIT de prueba de ARCA con la condición de IVA que elijas arriba
          ({CONDICIONES_IVA.find(c => c.value === condicionIva)?.label}). Después la podés cambiar en Editar datos.
        </p>
      )}
    </div>
  )
}

// ─── Avance del alta ─────────────────────────────────────────────────────────

function ProgresoAlta({ alta, esPrueba, clave, busy, onClave, onReintentar, onCancelar }: {
  alta: AltaFiscal
  esPrueba: boolean
  clave: string
  busy: boolean
  onClave: (clave: string) => void
  onReintentar: (puntoVenta: number | null) => void
  onCancelar: () => void
}) {
  const [claveNueva, setClaveNueva] = useState('')
  const [puntoVenta, setPuntoVenta] = useState(alta.punto_venta ? String(alta.punto_venta) : '')
  const actual = ORDEN_PASO[alta.paso]
  const conError = alta.estado === 'error'
  const errorEnPuntoVenta = alta.paso === 'puntos_venta' || alta.paso === 'punto_venta'

  return (
    <div className="space-y-4">
      <ol className="space-y-2.5">
        {PASOS_ALTA.filter(p => !(esPrueba && p.soloProduccion)).map(paso => {
          const hecho = paso.orden < actual
          const esActual = paso.orden === actual
          return (
            <li key={paso.orden} className="flex items-center gap-2.5 text-sm">
              {hecho ? <CheckCircle className="w-5 h-5 text-green-600" />
                : esActual && conError ? <XCircle className="w-5 h-5 text-red-600" />
                : esActual ? <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
                : <Circle className="w-5 h-5 text-gray-300" />}
              <span className={hecho ? 'text-gray-500' : esActual ? 'font-medium text-gray-900' : 'text-gray-400'}>{paso.label}</span>
            </li>
          )
        })}
      </ol>

      {!conError && (clave ? (
        <p className="text-xs text-gray-500">Esto puede tardar unos minutos. No cierres esta pantalla.</p>
      ) : (
        // Si se recargó la pantalla, la clave ya no está en memoria y hace falta para seguir
        <div className="space-y-2">
          <p className="text-sm text-gray-700">Ingresá tu clave fiscal para continuar con el alta:</p>
          <div className="flex gap-2">
            <input type="password" value={claveNueva} onChange={e => setClaveNueva(e.target.value)} autoComplete="off" className={inputClass} />
            <button onClick={() => onClave(claveNueva)} disabled={!claveNueva} className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg disabled:opacity-50">
              Continuar
            </button>
          </div>
        </div>
      ))}

      {conError && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg text-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{alta.error || 'ARCA no pudo completar este paso.'}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Clave fiscal</label>
              <input type="password" value={claveNueva} onChange={e => setClaveNueva(e.target.value)} autoComplete="off" className={inputClass} />
            </div>
            {errorEnPuntoVenta && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Punto de venta</label>
                <input type="number" min={1} value={puntoVenta} onChange={e => setPuntoVenta(e.target.value)} placeholder="Automático" className={inputClass} />
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { onClave(claveNueva); onReintentar(Number(puntoVenta) || null) }}
              disabled={busy || !claveNueva}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg disabled:opacity-50"
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              Reintentar
            </button>
            <button onClick={onCancelar} disabled={busy} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg">
              Cancelar alta
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Edición de datos del negocio ────────────────────────────────────────────

function EditarDatosForm({ initial, busy, onSave, onCancel }: {
  initial: FiscalConfig
  busy: boolean
  onSave: (params: SaveConfigParams) => void
  onCancel: () => void
}) {
  const [razonSocial, setRazonSocial] = useState(initial.razon_social || '')
  const [condicionIva, setCondicionIva] = useState(initial.condicion_iva || 'Monotributo')
  const [domicilioComercial, setDomicilioComercial] = useState(initial.domicilio_comercial || '')
  const [ingresosBrutos, setIngresosBrutos] = useState(initial.ingresos_brutos || '')
  const [inicioActividades, setInicioActividades] = useState(initial.inicio_actividades || '')
  const [actividadAfip, setActividadAfip] = useState<number | null>(initial.actividad_afip)
  const [actividadCustom, setActividadCustom] = useState(
    initial.actividad_afip != null && !ACTIVIDADES_COMUNES.some(a => a.code === initial.actividad_afip)
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Razón Social *</label>
          <input type="text" value={razonSocial} onChange={e => setRazonSocial(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Condición frente al IVA *</label>
          <select value={condicionIva} onChange={e => setCondicionIva(e.target.value)} className={inputClass}>
            {CONDICIONES_IVA.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Domicilio comercial</label>
          <input type="text" value={domicilioComercial} onChange={e => setDomicilioComercial(e.target.value)} placeholder="Av. San Martín 123 - Rosario, Santa Fe" className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ingresos Brutos</label>
          <input type="text" value={ingresosBrutos} onChange={e => setIngresosBrutos(e.target.value)} placeholder="N° de inscripción o Exento" className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Inicio de actividades</label>
          <input type="date" value={inicioActividades} onChange={e => setInicioActividades(e.target.value)} className={inputClass} />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Actividad ARCA (opcional)</label>
          {!actividadCustom ? (
            <select
              value={actividadAfip ?? ''}
              onChange={e => {
                if (e.target.value === 'otro') setActividadCustom(true)
                else setActividadAfip(e.target.value ? Number(e.target.value) : null)
              }}
              className={inputClass}
            >
              <option value="">Sin especificar</option>
              {ACTIVIDADES_COMUNES.map(a => <option key={a.code} value={a.code}>{a.label}</option>)}
              <option value="otro">Otra actividad (ingresá el código)</option>
            </select>
          ) : (
            <div className="flex gap-2">
              <input type="number" value={actividadAfip ?? ''} onChange={e => setActividadAfip(e.target.value ? Number(e.target.value) : null)} placeholder="471120" className={inputClass} />
              <button onClick={() => setActividadCustom(false)} className="px-3 py-2 text-xs text-gray-500 bg-gray-100 rounded-lg hover:bg-gray-200">
                Ver lista
              </button>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-1">La encontrás en tu constancia de inscripción en ARCA.</p>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => onSave({
            razonSocial, condicionIva, actividadAfip, domicilioComercial, ingresosBrutos,
            inicioActividades: inicioActividades || null,
          })}
          disabled={busy || !razonSocial.trim()}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Guardar cambios
        </button>
        <button onClick={onCancel} className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg">
          Cancelar
        </button>
      </div>
    </div>
  )
}

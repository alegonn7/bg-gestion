// Alta de la facturación hecha a mano por el cliente en la página de ARCA, con un paso a paso.
// Se muestra cuando la app no puede hacer el alta sola. La app genera el archivo que se sube a
// ARCA (pedido de certificado) y al final verifica todo: certificado, autorización y punto de venta.
import { useEffect, useState, type DragEvent } from 'react'
import { AlertTriangle, CheckCircle2, Clock, Download, FileCheck, KeyRound, Laptop, ListChecks, Loader2, RotateCcw, Upload } from 'lucide-react'
import { ErrorDelServidor, type AltaFiscal, type AltaManualParams } from '@/store/fiscal'
import {
  Boton, BotonAbrirArca, Copiable, Instrucciones, Nota, PasoTutorial, Ruta, Servicio,
  guardarHechos, leerHechos, type EstadoPaso,
} from './TutorialArca'

const CONDICIONES_IVA = [
  { value: 'Monotributo', label: 'Monotributista' },
  { value: 'RI', label: 'Responsable Inscripto' },
  { value: 'Exento', label: 'IVA Exento' },
]
const NOMBRE_ARCHIVO = 'BGGestion-pedido-certificado.csr'
const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none'

// 0: archivo (app) · 1 a 4: trámites en ARCA · 5: subir el certificado (app)
const PASOS = 6

function primerPendiente(hechos: number[]): number {
  for (let i = 0; i < PASOS; i++) if (!hechos.includes(i)) return i
  return PASOS - 1
}

// Guarda el pedido de certificado; devuelve dónde quedó ('' si no se sabe, null si se canceló)
async function guardarPedido(csr: string): Promise<string | null> {
  if (window.electron?.guardarArchivo) {
    const resultado = await window.electron.guardarArchivo(NOMBRE_ARCHIVO, btoa(csr))
    if (resultado.canceled) return null
    if (!resultado.success) throw new Error('No se pudo guardar el archivo. Probá de nuevo.')
    return resultado.path ?? ''
  }
  const url = URL.createObjectURL(new Blob([csr], { type: 'application/pkcs10' }))
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = NOMBRE_ARCHIVO
  enlace.click()
  URL.revokeObjectURL(url)
  return ''
}

interface Props {
  inicial: { cuit: string | null; razon_social: string | null; condicion_iva: string | null } | null
  alta: AltaFiscal | null
  onPedir: (params: AltaManualParams) => Promise<{ csr: string; alias: string }>
  onVerificar: (params: { certificadoBase64: string; puntoVenta: number }) => Promise<void>
  onCancelar: () => Promise<void>
}

export default function AltaManualArca({ inicial, alta, onPedir, onVerificar, onCancelar }: Props) {
  const alias = alta?.estado === 'manual' ? alta.cert_alias || '' : ''
  const claveHechos = `bg-alta-manual:${alias}`

  // Paso 1: datos del negocio y archivo para ARCA
  const [cuit, setCuit] = useState(inicial?.cuit || '')
  const [razonSocial, setRazonSocial] = useState(inicial?.razon_social || '')
  const [condicionIva, setCondicionIva] = useState(inicial?.condicion_iva || 'Monotributo')
  const [editando, setEditando] = useState(false)
  const [rutaArchivo, setRutaArchivo] = useState<string | null>(null)
  const [preparando, setPreparando] = useState(false)
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null)

  // Último paso: certificado y punto de venta
  const [certificado, setCertificado] = useState<{ nombre: string; base64: string } | null>(null)
  const [puntoVenta, setPuntoVenta] = useState('')
  const [verificando, setVerificando] = useState(false)
  const [errorFinal, setErrorFinal] = useState<{ mensaje: string; tramite?: number } | null>(null)
  const [arrastrando, setArrastrando] = useState(false)

  // Pasos marcados como hechos (quedan guardados: el cliente va y viene entre la app y ARCA)
  const [hechos, setHechos] = useState<number[]>([])
  const [abierto, setAbierto] = useState<number | null>(0)
  useEffect(() => {
    const guardados = alias ? leerHechos(claveHechos) : []
    setHechos(guardados)
    setAbierto(primerPendiente(alias ? [0, ...guardados] : []))
    setEditando(false)
  }, [alias])

  const completos = alias ? [0, ...hechos] : []
  const actual = primerPendiente(completos)
  const estadoDe = (paso: number): EstadoPaso => (completos.includes(paso) ? 'hecho' : paso === actual ? 'actual' : 'pendiente')
  const alternar = (paso: number) => setAbierto(abierto === paso ? null : paso)
  const marcarHecho = (paso: number) => {
    const nuevos = [...new Set([...hechos, paso])]
    setHechos(nuevos)
    guardarHechos(claveHechos, nuevos)
    setAbierto(primerPendiente([0, ...nuevos]))
  }
  const progreso = Math.round((new Set(completos).size / PASOS) * 100)

  const sistemaPuntoVenta = condicionIva === 'Monotributo'
    ? 'Factura Electrónica - Monotributo - Web Services'
    : 'RECE para aplicativo y web services'

  const prepararArchivo = async (nuevo: boolean) => {
    setErrorArchivo(null)
    const cuitLimpio = cuit.replace(/\D/g, '')
    if (cuitLimpio.length !== 11) return setErrorArchivo('El CUIT tiene que tener 11 dígitos')
    if (!razonSocial.trim()) return setErrorArchivo('Ingresá la razón social')
    setPreparando(true)
    try {
      const { csr } = await onPedir({ cuit: cuitLimpio, razonSocial: razonSocial.trim(), condicionIva, nuevo })
      const ruta = await guardarPedido(csr)
      if (ruta !== null) setRutaArchivo(ruta)
    } catch (err: any) {
      setErrorArchivo(err.message)
    } finally {
      setPreparando(false)
    }
  }

  const elegirCertificado = async (archivo: File | undefined) => {
    setErrorFinal(null)
    if (!archivo) return
    if (archivo.size > 50_000) {
      return setErrorFinal({ mensaje: 'Ese archivo es demasiado grande para ser un certificado. Elegí el que descargaste de ARCA.', tramite: 2 })
    }
    const bytes = new Uint8Array(await archivo.arrayBuffer())
    let binario = ''
    bytes.forEach((b) => { binario += String.fromCharCode(b) })
    setCertificado({ nombre: archivo.name, base64: btoa(binario) })
  }

  const soltar = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setArrastrando(false)
    elegirCertificado(e.dataTransfer.files?.[0])
  }

  const verificar = async () => {
    setErrorFinal(null)
    if (!certificado) return setErrorFinal({ mensaje: 'Elegí el certificado que descargaste de ARCA al final del trámite 2.', tramite: 2 })
    const numero = Number(puntoVenta)
    if (!Number.isInteger(numero) || numero < 1) return setErrorFinal({ mensaje: 'Escribí el número del punto de venta que creaste en el trámite 4.', tramite: 4 })
    setVerificando(true)
    try {
      await onVerificar({ certificadoBase64: certificado.base64, puntoVenta: numero })
      guardarHechos(claveHechos, [])
    } catch (err: any) {
      const tramite = err instanceof ErrorDelServidor ? Number(err.datos.tramite) || undefined : undefined
      setErrorFinal({ mensaje: err.message, tramite })
    } finally {
      setVerificando(false)
    }
  }

  const botonListo = (paso: number, texto: string, alternativa?: string) => (
    <div className="flex flex-wrap gap-2 pt-1">
      <button type="button" onClick={() => marcarHecho(paso)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium">
        <CheckCircle2 className="w-4 h-4" />{texto}
      </button>
      {alternativa && (
        <button type="button" onClick={() => marcarHecho(paso)} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm">
          {alternativa}
        </button>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Presentación */}
      <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 flex-shrink-0 rounded-lg bg-white border border-indigo-100 flex items-center justify-center">
            <ListChecks className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-gray-900">Conectá tu negocio con ARCA, paso a paso</h3>
            <p className="text-sm text-gray-600 mt-0.5">
              En este momento la conexión automática no está disponible, así que vas a hacer 4 trámites cortos en la
              página de ARCA. Te guiamos en cada uno y al final la app revisa que esté todo bien.
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-gray-200 text-xs text-gray-600"><Clock className="w-3.5 h-3.5" />Unos 15 minutos</span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-gray-200 text-xs text-gray-600"><KeyRound className="w-3.5 h-3.5" />Clave fiscal nivel 3</span>
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-gray-200 text-xs text-gray-600"><Laptop className="w-3.5 h-3.5" />Desde esta computadora</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <div className="flex-1 h-1.5 rounded-full bg-indigo-100 overflow-hidden">
            <div className="h-full rounded-full bg-indigo-600 transition-all duration-500" style={{ width: `${progreso}%` }} />
          </div>
          <span className="text-xs font-medium text-gray-600 whitespace-nowrap">Paso {Math.min(actual + 1, PASOS)} de {PASOS}</span>
        </div>
      </div>

      {/* 1. Archivo para ARCA */}
      <PasoTutorial numero={1} titulo="Descargá el archivo para ARCA" detalle="Lo vas a subir en la página de ARCA para crear tu certificado"
        lugar="app" estado={estadoDe(0)} abierto={abierto === 0} acento="indigo" onAbrir={() => alternar(0)}>
        {alias && !editando ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
              <FileCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Archivo listo: <strong>{NOMBRE_ARCHIVO}</strong>
                {rutaArchivo && <span className="block text-xs text-green-700 break-all mt-0.5">Guardado en {rutaArchivo}</span>}
              </span>
            </div>
            <p className="text-sm text-gray-700">
              Tu certificado se va a llamar <Copiable texto={alias} />. Lo vas a escribir en el trámite 2.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => prepararArchivo(false)} disabled={preparando} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-sm disabled:opacity-50">
                {preparando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}Descargar de nuevo
              </button>
              <button type="button" onClick={() => setEditando(true)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-gray-500 hover:bg-gray-100 text-sm">
                <RotateCcw className="w-4 h-4" />Empezar de nuevo con otros datos
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Revisá los datos del negocio y descargá el archivo. No hace falta la clave fiscal.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">CUIT del negocio</label>
                <input value={cuit} onChange={(e) => setCuit(e.target.value)} placeholder="20123456789" className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Razón social</label>
                <input value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} placeholder="Mi Negocio" className={inputClass} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Condición frente al IVA</label>
                <select value={condicionIva} onChange={(e) => setCondicionIva(e.target.value)} className={inputClass}>
                  {CONDICIONES_IVA.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>
            {editando && (
              <Nota tipo="atencion">Se va a generar un archivo nuevo, con otro nombre de certificado. Si ya hiciste el trámite 2, vas a tener que hacerlo otra vez.</Nota>
            )}
            {errorArchivo && (
              <p className="flex items-center gap-1.5 text-sm text-red-600"><AlertTriangle className="w-4 h-4" />{errorArchivo}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => prepararArchivo(editando)} disabled={preparando} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50">
                {preparando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Descargar el archivo para ARCA
              </button>
              {editando && (
                <button type="button" onClick={() => setEditando(false)} className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm">Cancelar</button>
              )}
            </div>
          </div>
        )}
      </PasoTutorial>

      {/* 2. Trámite 1: habilitar los certificados */}
      <PasoTutorial numero={2} titulo="Trámite 1 · Habilitá los certificados" detalle="Se hace una sola vez · unos 2 minutos"
        lugar="arca" estado={estadoDe(1)} abierto={abierto === 1} acento="indigo" onAbrir={() => alternar(1)}>
        <p className="text-sm text-gray-600">ARCA necesita que actives el servicio para crear certificados digitales.</p>
        <Instrucciones pasos={[
          <>Entrá a ARCA con tu CUIT y tu clave fiscal. <span className="inline-block align-middle ml-1"><BotonAbrirArca acento="indigo" chico /></span></>,
          <>Buscá y abrí <Servicio>Administrador de Relaciones de Clave Fiscal</Servicio></>,
          <>Tocá <Boton>Adherir servicio</Boton></>,
          <>Elegí <Ruta partes={['ARCA', 'Servicios interactivos', 'Administración de Certificados Digitales']} /> y tocá <Boton>Confirmar</Boton></>,
          <>Salí de ARCA y volvé a entrar, así aparece el servicio nuevo.</>,
        ]} />
        <Nota>Si en tus servicios ya aparece <strong>Administración de Certificados Digitales</strong>, este trámite ya está hecho.</Nota>
        {botonListo(1, 'Listo, ya lo hice', 'Ya lo tenía')}
      </PasoTutorial>

      {/* 3. Trámite 2: crear el certificado */}
      <PasoTutorial numero={3} titulo="Trámite 2 · Creá el certificado" detalle="Con el archivo del paso 1 · unos 3 minutos"
        lugar="arca" estado={estadoDe(2)} abierto={abierto === 2} acento="indigo" onAbrir={() => alternar(2)}>
        <p className="text-sm text-gray-600">Con el archivo que descargaste, ARCA te da tu certificado digital.</p>
        <Instrucciones pasos={[
          <>Abrí <Servicio>Administración de Certificados Digitales</Servicio>. Si te pregunta a quién representás, elegí el negocio.</>,
          <>Tocá <Boton>Agregar alias</Boton></>,
          <>En <strong>Alias</strong> escribí exactamente {alias ? <Copiable texto={alias} /> : <em>el nombre que te muestra el paso 1</em>}</>,
          <>Tocá <Boton>Examinar</Boton> y elegí el archivo <strong>{NOMBRE_ARCHIVO}</strong>{rutaArchivo ? <> (está en <span className="break-all">{rutaArchivo}</span>)</> : ', que quedó en tu carpeta de Descargas'}.</>,
          <>Tocá <Boton>Agregar alias</Boton></>,
          <>En la lista, al lado de {alias ? <strong>{alias}</strong> : 'tu certificado'}, tocá <Boton>Ver</Boton> y después <Boton>Descargar</Boton>. Se baja tu certificado: lo vas a subir en el último paso.</>,
        ]} />
        <Nota tipo="atencion">El archivo que subís a ARCA no es el certificado. El certificado es el que descargás al final de este trámite.</Nota>
        {botonListo(2, 'Listo, ya descargué el certificado')}
      </PasoTutorial>

      {/* 4. Trámite 3: autorizarlo para facturar */}
      <PasoTutorial numero={4} titulo="Trámite 3 · Autorizalo para facturar" detalle="Unos 2 minutos"
        lugar="arca" estado={estadoDe(3)} abierto={abierto === 3} acento="indigo" onAbrir={() => alternar(3)}>
        <p className="text-sm text-gray-600">Le indicás a ARCA que ese certificado puede hacer facturas electrónicas de tu negocio.</p>
        <Instrucciones pasos={[
          <>Volvé a <Servicio>Administrador de Relaciones de Clave Fiscal</Servicio></>,
          <>Tocá <Boton>Nueva Relación</Boton>. En <strong>Representado</strong> tiene que figurar el CUIT del negocio.</>,
          <>Tocá <Boton>Buscar</Boton> y elegí <Ruta partes={['ARCA', 'Web Services', 'Facturación Electrónica']} /></>,
          <>En <strong>Representante</strong> tocá el otro <Boton>Buscar</Boton> y elegí tu certificado {alias && <strong>{alias}</strong>} (figura como <em>Computador Fiscal</em>).</>,
          <>Tocá <Boton>Confirmar</Boton> y, en la pantalla siguiente, otra vez <Boton>Confirmar</Boton></>,
        ]} />
        {botonListo(3, 'Listo, ya lo autoricé')}
      </PasoTutorial>

      {/* 5. Trámite 4: punto de venta */}
      <PasoTutorial numero={5} titulo="Trámite 4 · Creá el punto de venta" detalle="El número que va adelante de cada factura · unos 3 minutos"
        lugar="arca" estado={estadoDe(4)} abierto={abierto === 4} acento="indigo" onAbrir={() => alternar(4)}>
        <p className="text-sm text-gray-600">
          Es el número que va adelante de cada factura (por ejemplo, <strong>0002</strong>-00000001). Para facturar desde la app hace falta uno especial.
        </p>
        <Instrucciones pasos={[
          <>Abrí <Servicio>Administración de puntos de venta y domicilios</Servicio> y tocá el nombre del negocio.</>,
          <>Entrá en <Boton>A/B/M de Puntos de venta</Boton> y tocá <Boton>Agregar</Boton></>,
          <>
            Completá:
            <ul className="mt-1.5 space-y-1 list-disc pl-4 marker:text-gray-400">
              <li><strong>Número:</strong> el que sigue a los que ya tenés (si no tenés ninguno, 1). Anotalo.</li>
              <li><strong>Nombre de fantasía:</strong> el que quieras.</li>
              <li><strong>Sistema:</strong> <span className="px-1.5 py-px rounded bg-indigo-50 border border-indigo-200 text-indigo-900 font-medium">{sistemaPuntoVenta}</span></li>
              <li><strong>Domicilio:</strong> el del negocio.</li>
            </ul>
          </>,
          <>Tocá <Boton>Aceptar</Boton> y confirmá con <Boton>Sí</Boton></>,
        ]} />
        <Nota>Si ya tenés un punto de venta con el sistema <strong>{sistemaPuntoVenta}</strong>, podés usar ese y saltear este trámite.</Nota>
        <Nota tipo="atencion">No sirven los puntos de venta de «Factura en línea» ni de «Controlador fiscal»: tiene que ser el de Web Services.</Nota>
        {botonListo(4, 'Listo, ya tengo el punto de venta')}
      </PasoTutorial>

      {/* 6. Subir el certificado y verificar */}
      <PasoTutorial numero={6} titulo="Subí el certificado y terminá" detalle="La app revisa todo con ARCA"
        lugar="app" estado={estadoDe(5)} abierto={abierto === 5} acento="indigo" onAbrir={() => alternar(5)}>
        <label
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={soltar}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-center cursor-pointer transition-colors ${
            arrastrando ? 'border-indigo-400 bg-indigo-50' : certificado ? 'border-green-300 bg-green-50' : 'border-gray-300 hover:border-indigo-300 hover:bg-gray-50'
          }`}
        >
          <input type="file" className="hidden" onChange={(e) => { elegirCertificado(e.target.files?.[0]); e.target.value = '' }} />
          {certificado ? (
            <>
              <FileCheck className="w-6 h-6 text-green-600" />
              <span className="text-sm font-medium text-green-800 break-all">{certificado.nombre}</span>
              <span className="text-xs text-green-700">Tocá para elegir otro</span>
            </>
          ) : (
            <>
              <Upload className="w-6 h-6 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">Elegí el certificado que descargaste de ARCA</span>
              <span className="text-xs text-gray-500">Es el archivo del final del trámite 2. También podés arrastrarlo acá.</span>
            </>
          )}
        </label>
        <div className="max-w-[16rem]">
          <label className="block text-xs font-medium text-gray-600 mb-1">Número de punto de venta (el del trámite 4)</label>
          <input type="number" min={1} value={puntoVenta} onChange={(e) => setPuntoVenta(e.target.value)} placeholder="2" className={inputClass} />
        </div>
        {errorFinal && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p>{errorFinal.mensaje}</p>
              {errorFinal.tramite && (
                <button type="button" onClick={() => setAbierto(errorFinal.tramite!)} className="text-xs font-semibold underline underline-offset-2">
                  Ver el trámite {errorFinal.tramite}
                </button>
              )}
            </div>
          </div>
        )}
        <button type="button" onClick={verificar} disabled={verificando || !alias} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium disabled:opacity-50">
          {verificando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {verificando ? 'Revisando con ARCA…' : 'Verificar y conectar'}
        </button>
      </PasoTutorial>

      {alias && (
        <div className="flex justify-end">
          <button type="button" onClick={() => onCancelar()} className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2">
            Cancelar la conexión
          </button>
        </div>
      )}
    </div>
  )
}

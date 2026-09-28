import { useEffect, useState } from 'react'
import { Save, KeyRound, Eye, EyeOff } from 'lucide-react'
import { useAuthStore } from '@/store/auth'

const ROLES: Record<string, string> = {
  owner: 'Dueño',
  admin: 'Administrador',
  manager: 'Manager',
  employee: 'Empleado',
}

const inputClass = 'w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none'
const soloLectura = 'px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm'

// Datos del usuario que está usando la app: nombre (dueño y administrador) y contraseña (todos)
export default function MiCuentaSection() {
  const { user, isOffline, actualizarMiNombre, cambiarMiClave } = useAuthStore()
  // El nombre de encargados y empleados lo cambia el dueño: queda registrado en lo que hace cada uno
  const puedeCambiarNombre = user?.role === 'owner' || user?.role === 'admin'

  const [nombre, setNombre] = useState(user?.full_name || '')
  const [guardandoNombre, setGuardandoNombre] = useState(false)
  const [nombreGuardado, setNombreGuardado] = useState(false)
  const [errorNombre, setErrorNombre] = useState('')

  const [cambiandoClave, setCambiandoClave] = useState(false)
  const [claves, setClaves] = useState({ actual: '', nueva: '', repetir: '' })
  const [verClaves, setVerClaves] = useState(false)
  const [guardandoClave, setGuardandoClave] = useState(false)
  const [claveCambiada, setClaveCambiada] = useState(false)
  const [errorClave, setErrorClave] = useState('')

  useEffect(() => { setNombre(user?.full_name || '') }, [user?.full_name])

  const guardarNombre = async () => {
    setGuardandoNombre(true)
    setErrorNombre('')
    try {
      await actualizarMiNombre(nombre)
      setNombreGuardado(true)
      setTimeout(() => setNombreGuardado(false), 3000)
    } catch (err: any) {
      setErrorNombre(err.message)
    } finally {
      setGuardandoNombre(false)
    }
  }

  const guardarClave = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorClave('')
    if (claves.nueva.length < 6) return setErrorClave('La contraseña nueva debe tener al menos 6 caracteres')
    if (claves.nueva !== claves.repetir) return setErrorClave('Las dos contraseñas nuevas no coinciden')
    setGuardandoClave(true)
    try {
      await cambiarMiClave(claves.actual, claves.nueva)
      setClaves({ actual: '', nueva: '', repetir: '' })
      setCambiandoClave(false)
      setClaveCambiada(true)
      setTimeout(() => setClaveCambiada(false), 5000)
    } catch (err: any) {
      setErrorClave(err.message)
    } finally {
      setGuardandoClave(false)
    }
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-lg">
          👤
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Mi Cuenta</h2>
          <p className="text-sm text-gray-500">Datos de tu usuario</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
          {puedeCambiarNombre ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Tu nombre y apellido"
                className={inputClass}
              />
              <button
                onClick={guardarNombre}
                disabled={guardandoNombre || isOffline || !nombre.trim() || nombre.trim() === (user?.full_name || '')}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition font-medium text-sm whitespace-nowrap"
              >
                <Save className="w-4 h-4" />
                {guardandoNombre ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          ) : (
            <>
              <div className={soloLectura}>{user?.full_name || '—'}</div>
              <p className="text-xs text-gray-400 mt-1">Si hay que corregirlo, pedíselo al dueño: lo cambia desde Usuarios.</p>
            </>
          )}
          {nombreGuardado && <p className="text-sm text-green-600 font-medium mt-1">✓ Nombre guardado</p>}
          {errorNombre && <p className="text-sm text-red-600 mt-1">{errorNombre}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <div className={`${soloLectura} truncate`}>{user?.email || '—'}</div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
          <div className={soloLectura}>{(user?.role && ROLES[user.role]) || '—'}</div>
        </div>
      </div>

      {/* Contraseña */}
      <div className="mt-5 pt-5 border-t border-gray-100">
        {!cambiandoClave ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">Contraseña</p>
              {claveCambiada
                ? <p className="text-sm text-green-600 font-medium">✓ Contraseña cambiada. La próxima vez entrá con la nueva.</p>
                : <p className="text-xs text-gray-400">La que usás para entrar a la app.</p>}
            </div>
            <button
              onClick={() => { setCambiandoClave(true); setErrorClave('') }}
              disabled={isOffline}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition text-sm font-medium"
            >
              <KeyRound className="w-4 h-4" />
              Cambiar contraseña
            </button>
          </div>
        ) : (
          <form onSubmit={guardarClave} className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Cambiar contraseña</p>
            <input
              type={verClaves ? 'text' : 'password'}
              value={claves.actual}
              onChange={e => setClaves(c => ({ ...c, actual: e.target.value }))}
              placeholder="Contraseña actual"
              className={inputClass}
              autoFocus
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type={verClaves ? 'text' : 'password'}
                value={claves.nueva}
                onChange={e => setClaves(c => ({ ...c, nueva: e.target.value }))}
                placeholder="Contraseña nueva (mínimo 6)"
                className={inputClass}
                required
              />
              <input
                type={verClaves ? 'text' : 'password'}
                value={claves.repetir}
                onChange={e => setClaves(c => ({ ...c, repetir: e.target.value }))}
                placeholder="Repetí la contraseña nueva"
                className={inputClass}
                required
              />
            </div>
            <button
              type="button"
              onClick={() => setVerClaves(v => !v)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
            >
              {verClaves ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {verClaves ? 'Ocultar' : 'Mostrar'} contraseñas
            </button>
            {errorClave && <p className="text-sm text-red-600">{errorClave}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setCambiandoClave(false); setClaves({ actual: '', nueva: '', repetir: '' }); setErrorClave('') }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardandoClave}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition text-sm font-medium"
              >
                {guardandoClave ? 'Cambiando...' : 'Cambiar contraseña'}
              </button>
            </div>
          </form>
        )}
        {isOffline && <p className="text-xs text-amber-600 mt-2">Sin conexión no se pueden cambiar estos datos.</p>}
      </div>
    </section>
  )
}

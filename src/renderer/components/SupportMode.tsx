// Modo soporte de plataforma (super admin). El selector de empresa que aparece al entrar con la
// cuenta de soporte, y el cartel fijo que recuerda que se está viendo la empresa de un cliente en
// solo lectura. El acceso de solo lectura lo garantizan las policies del servidor; esto es la parte
// visible para no confundirse de cuenta.
import { useMemo, useState } from 'react'
import { LifeBuoy, Search, LogOut, Eye } from 'lucide-react'
import { useAuthStore } from '@/store/auth'

export function SupportOrgPicker() {
  const { supportEmpresas, enterSupportOrg, logout } = useAuthStore()
  const [busqueda, setBusqueda] = useState('')
  const [entrando, setEntrando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const lista = [...supportEmpresas].sort((a, b) => a.name.localeCompare(b.name))
    return q ? lista.filter(e => e.name.toLowerCase().includes(q)) : lista
  }, [busqueda, supportEmpresas])

  const entrar = async (id: string) => {
    setError(null)
    setEntrando(id)
    try {
      await enterSupportOrg(id)
    } catch (e: any) {
      setError(e.message)
      setEntrando(null)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-indigo-600 px-6 py-5 text-white flex items-center gap-3">
          <LifeBuoy className="w-6 h-6" />
          <div>
            <h1 className="text-lg font-semibold">Modo soporte</h1>
            <p className="text-indigo-100 text-sm">Elegí la empresa que querés ver (solo lectura)</p>
          </div>
        </div>
        <div className="p-5 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3" />
            <input
              autoFocus
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar empresa"
              className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="max-h-80 overflow-y-auto divide-y border border-gray-200 rounded-lg">
            {filtradas.length === 0 ? (
              <p className="text-sm text-gray-500 px-3 py-4 text-center">No hay empresas para mostrar.</p>
            ) : (
              filtradas.map(empresa => (
                <button
                  key={empresa.id}
                  onClick={() => entrar(empresa.id)}
                  disabled={entrando !== null}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-indigo-50 disabled:opacity-50"
                >
                  <span className="text-sm font-medium text-gray-800">{empresa.name}</span>
                  {entrando === empresa.id
                    ? <span className="text-xs text-indigo-600">Entrando…</span>
                    : <Eye className="w-4 h-4 text-gray-400" />}
                </button>
              ))
            )}
          </div>
          <button onClick={() => logout()} className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 pt-1">
            <LogOut className="w-4 h-4" />Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}

export function SupportBanner() {
  const { organization, logout } = useAuthStore()
  return (
    <div className="bg-indigo-600 text-white text-sm px-4 py-1.5 flex items-center justify-center gap-2 flex-wrap">
      <LifeBuoy className="w-4 h-4" />
      <span>
        Modo soporte · <strong>{organization?.name}</strong> · solo lectura
      </span>
      <button onClick={() => logout()} className="underline underline-offset-2 hover:text-indigo-100 ml-2">
        Salir
      </button>
    </div>
  )
}

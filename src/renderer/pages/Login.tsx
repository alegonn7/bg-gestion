import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { useNetworkStore } from '@/store/network'
import { formatSyncDate, offlineAuthApi } from '@/lib/offline'
import logoImg from '@/assets/logo.png'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [offlineStatus, setOfflineStatus] = useState<{
    available: boolean
    email?: string
    lastOnlineAt?: number
    maxDays?: number
  } | null>(null)

  const login = useAuthStore((state) => state.login)
  const { isOnline } = useNetworkStore()

  // ¿Hay credenciales guardadas en esta computadora para ingresar sin internet?
  useEffect(() => {
    let cancelled = false

    offlineAuthApi()?.status().then((status) => {
      if (!cancelled) setOfflineStatus(status)
    }).catch(() => {})

    return () => { cancelled = true }
  }, [])

  // Sin conexión, precargar el último usuario que ingresó en esta computadora
  useEffect(() => {
    if (!isOnline && offlineStatus?.email && !email) {
      setEmail(offlineStatus.email)
    }
  }, [isOnline, offlineStatus?.email])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await login(email, password)
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full mx-4">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <img src={logoImg} alt="BG Gestión" className="w-24 h-24 rounded-full object-cover mx-auto mb-4 shadow-lg" />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            BG Gestión
          </h1>
          <p className="text-gray-600">
            Inicia sesión para continuar
          </p>
        </div>

        {/* Aviso de modo sin conexión */}
        {!isOnline && (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
            <WifiOff className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold">Sin conexión a internet</p>
              {offlineStatus?.available ? (
                <p className="mt-1">
                  Podés ingresar con tu usuario y contraseña habituales para{' '}
                  <span className="font-medium">consultar productos y precios</span>.
                  {offlineStatus.lastOnlineAt && (
                    <> Última sincronización: {formatSyncDate(offlineStatus.lastOnlineAt)}.</>
                  )}
                </p>
              ) : (
                <p className="mt-1">
                  Todavía no hay datos guardados en esta computadora, así que hace falta internet para
                  el primer ingreso.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Login Form */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Correo electrónico
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                placeholder="tu@email.com"
                required
                autoFocus
              />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                placeholder="••••••••"
                required
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Iniciando sesión...
                </span>
              ) : (
                'Iniciar Sesión'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <p className="text-center text-sm text-gray-600">
              ¿No tienes cuenta?{' '}
              <a href="#" className="text-blue-600 hover:text-blue-700 font-medium">
                Regístrate aquí
              </a>
            </p>
          </div>
        </div>

        {/* Version */}
        <p className="text-center text-sm text-gray-500 mt-8">
          Versión 1.0.0 - Sistema de Gestión de Inventario
        </p>
        <p className="text-center text-xs text-gray-400 mt-2">
          © {new Date().getFullYear()} Binary Goats. Todos los derechos reservados.
        </p>
      </div>
    </div>
  )
}
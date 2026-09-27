import { WifiOff, RefreshCw, Wifi, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { useNetworkStore } from '@/store/network'
import { useProductsStore } from '@/store/products'
import { formatSyncDate } from '@/lib/offline'

/**
 * Aviso permanente del estado de conexión.
 *
 * - Sin conexión: recuerda que el sistema está en modo consulta y desde cuándo son los datos.
 * - Conexión recuperada tras un ingreso offline: pide volver a iniciar sesión para operar.
 */
export default function OfflineBanner() {
  const { isOffline, needsRelogin, logout, lastOnlineAt } = useAuthStore()
  const { isOnline, isChecking, checkConnection } = useNetworkStore()
  const { lastSyncAt, isFromCache } = useProductsStore()

  const showOffline = !isOnline || isOffline

  if (needsRelogin && isOnline) {
    return (
      <div className="flex items-center gap-3 px-6 py-2.5 bg-blue-50 border-b border-blue-200 text-blue-800">
        <Wifi className="w-4 h-4 flex-shrink-0" />
        <p className="text-sm flex-1">
          <span className="font-semibold">Conexión restablecida.</span>{' '}
          Ingresaste sin internet, así que el sistema sigue en modo consulta. Volvé a iniciar sesión para
          vender, cargar productos y sincronizar.
        </p>
        <button
          onClick={logout}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition flex-shrink-0"
        >
          Volver a ingresar
        </button>
      </div>
    )
  }

  if (!showOffline) return null

  return (
    <div className="flex items-center gap-3 px-6 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-900">
      <WifiOff className="w-4 h-4 flex-shrink-0" />
      <p className="text-sm flex-1">
        <span className="font-semibold">Sin conexión.</span>{' '}
        Podés consultar productos y precios guardados en esta computadora. Las ventas, ediciones y
        reportes no están disponibles hasta que vuelva internet.
        {isFromCache && lastSyncAt ? (
          <span className="text-amber-700"> · Datos del {formatSyncDate(lastSyncAt)}</span>
        ) : lastOnlineAt ? (
          <span className="text-amber-700"> · Última conexión: {formatSyncDate(lastOnlineAt)}</span>
        ) : null}
      </p>
      <button
        onClick={() => checkConnection()}
        disabled={isChecking}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg transition flex-shrink-0"
      >
        {isChecking
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <RefreshCw className="w-3.5 h-3.5" />}
        {isChecking ? 'Probando...' : 'Reintentar'}
      </button>
    </div>
  )
}

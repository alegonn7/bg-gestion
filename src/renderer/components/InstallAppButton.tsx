import { useEffect, useState } from 'react'
import { Download, Share, PlusSquare, X } from 'lucide-react'
import { canPromptInstall, isIOS, isRunningInstalled, promptInstall, subscribeInstallPrompt } from '@/lib/installApp'

/** "Instalar app" en el menú de la versión web. No aparece en escritorio ni si ya está instalada. */
export function InstallAppButton({ collapsed = false }: { collapsed?: boolean }) {
  const [canPrompt, setCanPrompt] = useState(canPromptInstall)
  const [showIOSHelp, setShowIOSHelp] = useState(false)

  useEffect(() => subscribeInstallPrompt(() => setCanPrompt(canPromptInstall())), [])

  if (window.electron || isRunningInstalled()) return null
  const ios = isIOS()
  if (!canPrompt && !ios) return null

  const handleClick = () => {
    if (canPrompt) promptInstall().catch(() => {})
    else setShowIOSHelp(true)
  }

  return (
    <>
      <button
        onClick={handleClick}
        title={collapsed ? 'Instalar app' : undefined}
        className={`w-full flex items-center ${collapsed ? 'justify-center px-2' : 'px-4'} gap-3 py-2 mb-1 text-blue-700 hover:bg-blue-50 rounded-lg transition`}
      >
        <Download className="w-5 h-5" />
        {!collapsed && <span>Instalar app</span>}
      </button>

      {showIOSHelp && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-end md:items-center justify-center p-4" onClick={() => setShowIOSHelp(false)}>
          <div className="bg-white rounded-xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Instalar en el iPhone</h3>
              <button onClick={() => setShowIOSHelp(false)} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>
            <ol className="space-y-3 text-sm text-gray-700">
              <li className="flex items-start gap-3">
                <span className="font-semibold">1.</span>
                <span>Abrí esta página en <b>Safari</b> y tocá el botón Compartir <Share className="inline w-4 h-4 text-blue-600 -mt-1" /></span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-semibold">2.</span>
                <span>Elegí <b>Agregar a inicio</b> <PlusSquare className="inline w-4 h-4 -mt-1" /></span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-semibold">3.</span>
                <span>Tocá <b>Agregar</b>. BG Gestión queda con su ícono en la pantalla de inicio.</span>
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  )
}

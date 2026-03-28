import { useEffect, useState } from 'react'
import UpdateChangelogModal from './components/UpdateChangelogModal'
import { useAuthStore } from '@/store/auth'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'

function App() {
  const { isAuthenticated, isLoading, checkAuth, setDeviceId } = useAuthStore()
  const [showChangelog, setShowChangelog] = useState(false)
  const [changelog, setChangelog] = useState('')
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)

  useEffect(() => {
    // Obtener device ID de Electron
    if (window.electron) {
      window.electron.getDeviceId().then((id) => {
        if (id) setDeviceId(id)
      })
    }

    // Verificar si hay sesión activa
    checkAuth()

    // Detectar actualización y mostrar changelog solo una vez
    async function checkChangelog() {
      if (!window.electron) return

      const version = await window.electron.getAppVersion?.()
      if (!version) return

      setCurrentVersion(version)

      const lastShown = await window.electron.getLastShownVersion?.()
      if (lastShown !== version) {
        const txt = window.electron.getChangelogText
          ? await window.electron.getChangelogText()
          : null

        setChangelog(txt || `¡La aplicación se ha actualizado a la versión ${version}!`)
        setShowChangelog(true)
      }
    }

    checkChangelog()
  }, [checkAuth, setDeviceId])

  const handleCloseChangelog = async () => {
    setShowChangelog(false)
    if (currentVersion) {
      await window.electron?.setLastShownVersion?.(currentVersion)
    }
  }

  return (
    <>
      {isLoading ? (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Cargando...</p>
          </div>
        </div>
      ) : isAuthenticated ? (
        <Dashboard />
      ) : (
        <Login />
      )}
      <UpdateChangelogModal
        isOpen={showChangelog}
        changelog={changelog}
        onClose={handleCloseChangelog}
      />
    </>
  )
}

export default App
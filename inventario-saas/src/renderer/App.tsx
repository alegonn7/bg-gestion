import { useEffect, useState } from 'react'
import UpdateChangelogModal from './components/UpdateChangelogModal'
import { useAuthStore } from '@/store/auth'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'


function App() {
  const { isAuthenticated, isLoading, checkAuth, setDeviceId } = useAuthStore()
  const [showChangelog, setShowChangelog] = useState(false)
  const [changelog, setChangelog] = useState('')


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
      if (!window.electron) return;
      const version = await window.electron.getSystemInfo?.().then(v => v?.version) || null;
      if (!version) return;
      const lastShown = await window.electron.getLastShownVersion?.();
      if (lastShown !== version) {
        // Leer changelog.txt desde public
        try {
          const resp = await fetch('changelog.txt');
          const txt = await resp.text();
          setChangelog(txt);
        } catch {
          setChangelog('¡La aplicación se ha actualizado a la versión ' + version + '!');
        }
        setShowChangelog(true);
        await window.electron.setLastShownVersion?.(version);
      }
    }
    checkChangelog();
  }, [checkAuth, setDeviceId])


  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
        <UpdateChangelogModal isOpen={showChangelog} changelog={changelog} onClose={() => setShowChangelog(false)} />
      </div>
    )
  }

  return <>
    {isAuthenticated ? <Dashboard /> : <Login />}
    <UpdateChangelogModal isOpen={showChangelog} changelog={changelog} onClose={() => setShowChangelog(false)} />
  </>
}

export default App
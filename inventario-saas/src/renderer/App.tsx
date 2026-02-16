import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'

function App() {
  const { isAuthenticated, isLoading, checkAuth, setDeviceId } = useAuthStore()

  useEffect(() => {
    // Obtener device ID de Electron
    if (window.electron) {
      window.electron.getDeviceId().then((id) => {
        if (id) setDeviceId(id)
      })
    }

    // Verificar si hay sesión activa
    checkAuth()
  }, [checkAuth, setDeviceId])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    )
  }

  return isAuthenticated ? <Dashboard /> : <Login />
}

export default App
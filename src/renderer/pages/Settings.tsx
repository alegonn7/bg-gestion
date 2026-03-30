import { useState, useEffect, useRef } from 'react'
import { Building2, Save, RefreshCw, DollarSign, Info, Upload, Trash2, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { useDollarStore } from '@/store/dollar'
import { supabase } from '@/lib/supabase'
import FiscalSetupSection from '@/components/FiscalSetupSection'

export default function SettingsPage() {
  const { user, organization } = useAuthStore()
  const {
    blueRate,
    blueBuyRate,
    lastUpdated,
    fetchBlueRate,
    manualMode,
    manualBlueRate,
    manualBlueBuyRate,
    setManualMode,
    setManualRates,
    syncFromOrg,
  } = useDollarStore()
    // Sincronizar valores manuales al cargar organización
    useEffect(() => {
      syncFromOrg();
    }, [organization]);
  const isOwnerOrAdmin = user?.role === 'owner' || user?.role === 'admin'

  // Datos editables de la empresa
  const [companyName, setCompanyName] = useState(organization?.name || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [refreshingRate, setRefreshingRate] = useState(false)

  // Logo de la empresa
  const [logoUrl, setLogoUrl] = useState<string | null>(organization?.logo_url || null)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoError, setLogoError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setCompanyName(organization?.name || '')
    setLogoUrl(organization?.logo_url || null)
  }, [organization])

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !organization || !isOwnerOrAdmin) return

    // Validar tipo y tamaño
    const validTypes = ['image/png', 'image/jpeg', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setLogoError('Solo se permiten imágenes PNG, JPG o WEBP')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError('La imagen no debe superar 2 MB')
      return
    }

    setUploadingLogo(true)
    setLogoError(null)

    try {
      const ext = file.name.split('.').pop()
      const filePath = `${organization.id}/logo.${ext}`

      // Subir a Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('organization-logos')
        .upload(filePath, file, { upsert: true })

      if (uploadError) throw uploadError

      // Obtener URL pública
      const { data: urlData } = supabase.storage
        .from('organization-logos')
        .getPublicUrl(filePath)

      const publicUrl = urlData.publicUrl

      // Guardar URL en la tabla organizations
      const { error: updateError } = await supabase
        .from('organizations')
        .update({ logo_url: publicUrl })
        .eq('id', organization.id)

      if (updateError) throw updateError

      setLogoUrl(publicUrl)
      useAuthStore.setState((state) => ({
        organization: state.organization ? { ...state.organization, logo_url: publicUrl } : null,
      }))
    } catch (err: any) {
      console.error('Error uploading logo:', err)
      setLogoError(err.message || 'Error al subir el logo')
    } finally {
      setUploadingLogo(false)
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDeleteLogo = async () => {
    if (!organization || !isOwnerOrAdmin) return

    setUploadingLogo(true)
    setLogoError(null)

    try {
      // Listar archivos del directorio de la org para borrarlos
      const { data: files } = await supabase.storage
        .from('organization-logos')
        .list(organization.id)

      if (files && files.length > 0) {
        const filesToRemove = files.map(f => `${organization.id}/${f.name}`)
        await supabase.storage
          .from('organization-logos')
          .remove(filesToRemove)
      }

      // Limpiar URL en la tabla organizations
      const { error: updateError } = await supabase
        .from('organizations')
        .update({ logo_url: null })
        .eq('id', organization.id)

      if (updateError) throw updateError

      setLogoUrl(null)
      useAuthStore.setState((state) => ({
        organization: state.organization ? { ...state.organization, logo_url: null } : null,
      }))
    } catch (err: any) {
      console.error('Error deleting logo:', err)
      setLogoError(err.message || 'Error al eliminar el logo')
    } finally {
      setUploadingLogo(false)
    }
  }

  const handleSaveCompany = async () => {
    if (!organization || !isOwnerOrAdmin) return
    setSaving(true)
    setSaved(false)

    const { error } = await supabase
      .from('organizations')
      .update({ name: companyName.trim() })
      .eq('id', organization.id)

    setSaving(false)
    if (!error) {
      setSaved(true)
      // Actualizar en el store de auth
      useAuthStore.setState((state) => ({
        organization: state.organization ? { ...state.organization, name: companyName.trim() } : null,
      }))
      setTimeout(() => setSaved(false), 3000)
    }
  }

  const handleRefreshRate = async () => {
    setRefreshingRate(true)
    await fetchBlueRate()
    setRefreshingRate(false)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-500 mt-1">Ajustes generales de la empresa</p>
      </div>

      {/* Datos de la Empresa: solo owner/admin */}
      {isOwnerOrAdmin && (
        <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Empresa</h2>
              <p className="text-sm text-gray-500">Información de tu organización</p>
            </div>
          </div>
          <div className="space-y-4">
            {/* Nombre */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la empresa</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={!isOwnerOrAdmin}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            {/* Logo de la empresa */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Logo de la empresa</label>
              <p className="text-xs text-gray-400 mb-2">Se mostrará en los tickets de venta. PNG, JPG o WEBP, máx. 2 MB.</p>
              <div className="flex items-center gap-4">
                {/* Preview */}
                <div className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center overflow-hidden bg-gray-50 flex-shrink-0">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt="Logo de la empresa"
                      className="w-full h-full object-contain"
                      onError={() => setLogoUrl(null)}
                    />
                  ) : (
                    <Building2 className="w-8 h-8 text-gray-300" />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleUploadLogo}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition text-sm font-medium"
                  >
                    {uploadingLogo ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    {logoUrl ? 'Cambiar logo' : 'Subir logo'}
                  </button>
                  {logoUrl && (
                    <button
                      onClick={handleDeleteLogo}
                      disabled={uploadingLogo}
                      className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 disabled:opacity-50 transition text-sm font-medium"
                    >
                      <Trash2 className="w-4 h-4" />
                      Eliminar logo
                    </button>
                  )}
                </div>
              </div>
              {logoError && (
                <p className="text-sm text-red-500 mt-2">{logoError}</p>
              )}
            </div>
            {/* Info de solo lectura */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
                <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 uppercase text-sm font-medium">
                  {organization?.plan || '—'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado suscripción</label>
                <div className={`px-4 py-2.5 rounded-lg border text-sm font-medium ${
                  organization?.subscription_status === 'active'
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-yellow-50 border-yellow-200 text-yellow-700'
                }`}>
                  {organization?.subscription_status === 'active' ? 'Activo' : organization?.subscription_status || '—'}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Máx. sucursales</label>
                <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm">
                  {organization?.max_branches ?? '—'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Máx. productos/suc.</label>
                <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm">
                  {organization?.max_products_per_branch ?? '—'}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Máx. usuarios/suc.</label>
                <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm">
                  {organization?.max_users_per_branch ?? '—'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleSaveCompany}
                disabled={saving || companyName.trim() === organization?.name}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition font-medium text-sm"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Guardando...' : 'Guardar cambios'}
              </button>
              {saved && (
                <span className="text-sm text-green-600 font-medium">✓ Guardado</span>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Cotización Dólar */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Cotización Dólar Blue</h2>
            <p className="text-sm text-gray-500">Usada para las conversiones automáticas USD → ARS</p>
          </div>
        </div>

        {/* Switch modo manual/auto */}
        <div className="flex items-center gap-4 mb-4">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={manualMode}
              onChange={e => setManualMode(e.target.checked)}
              className="form-checkbox h-5 w-5 text-blue-600"
            />
            <span className="text-sm font-medium text-gray-700">Configurar cotización manualmente</span>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
            <div className="text-sm text-green-600 mb-1">Venta</div>
            {manualMode ? (
              <input
                type="number"
                className="text-2xl font-bold text-green-800 bg-transparent border-b border-green-400 focus:outline-none w-full text-center"
                value={manualBlueRate ?? ''}
                min={0}
                onChange={e => setManualRates(Number(e.target.value), manualBlueBuyRate ?? 0)}
              />
            ) : (
              <div className="text-2xl font-bold text-green-800">
                {blueRate ? `$${blueRate.toLocaleString('es-AR')}` : '—'}
              </div>
            )}
          </div>
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
            <div className="text-sm text-blue-600 mb-1">Compra</div>
            {manualMode ? (
              <input
                type="number"
                className="text-2xl font-bold text-blue-800 bg-transparent border-b border-blue-400 focus:outline-none w-full text-center"
                value={manualBlueBuyRate ?? ''}
                min={0}
                onChange={e => setManualRates(manualBlueRate ?? 0, Number(e.target.value))}
              />
            ) : (
              <div className="text-2xl font-bold text-blue-800">
                {blueBuyRate ? `$${blueBuyRate.toLocaleString('es-AR')}` : '—'}
              </div>
            )}
          </div>
        </div>

        {!manualMode && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {lastUpdated
                ? `Última actualización: ${new Date(lastUpdated).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`
                : 'Sin datos aún'
              }
            </div>
            <button
              onClick={handleRefreshRate}
              disabled={refreshingRate}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition text-sm font-medium"
            >
              <RefreshCw className={`w-4 h-4 ${refreshingRate ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>
        )}

        <p className="text-xs text-gray-400 mt-3">
          Fuente: dolarapi.com (fallback: bluelytics.com.ar). Se actualiza automáticamente cada 5 minutos.
        </p>
      </section>

      {/* Facturación Electrónica: solo owner/admin */}
      {isOwnerOrAdmin && <FiscalSetupSection />}

      {/* Cuenta del usuario */}
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm">
              {user?.full_name || '—'}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm truncate">
              {user?.email || '—'}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
            <div className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-700 text-sm capitalize">
              {user?.role || '—'}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
            <div className={`px-4 py-2.5 rounded-lg border text-sm font-medium ${
              user?.is_active
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {user?.is_active ? 'Activo' : 'Inactivo'}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

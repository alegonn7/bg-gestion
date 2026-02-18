import { useEffect, useState } from 'react'
import { Wallet, DollarSign, ArrowUpCircle, ArrowDownCircle, Clock, AlertTriangle, CheckCircle, XCircle, TrendingUp, CreditCard, Banknote } from 'lucide-react'
import { useCashRegisterStore, type CashRegister } from '@/store/cash-register'
import { useAuthStore } from '@/store/auth'

export default function CashRegisterPage() {
  const {
    registers,
    currentRegister,
    isLoading,
    fetchRegisters,
    fetchCurrentRegister,
    openRegister,
    closeRegister
  } = useCashRegisterStore()

  const { user } = useAuthStore()

  const [showOpenModal, setShowOpenModal] = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState<CashRegister | null>(null)
  const [openingAmount, setOpeningAmount] = useState('')
  const [closingAmount, setClosingAmount] = useState('')
  const [notesOpen, setNotesOpen] = useState('')
  const [notesClose, setNotesClose] = useState('')
  const [processing, setProcessing] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  // Permite solo números y un punto como separador decimal, reemplaza coma por punto
  const handleAmountInput = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(',', '.');
    // Solo permite un punto decimal y números
    value = value.replace(/[^0-9.]/g, '');
    // Si hay más de un punto, solo deja el primero
    const parts = value.split('.');
    if (parts.length > 2) {
      value = parts[0] + '.' + parts.slice(1).join('');
    }
    setter(value);
  };

  useEffect(() => {
    fetchCurrentRegister()
    fetchRegisters()
  }, [])

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(value)

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })

  const handleOpenRegister = async () => {
    const amount = parseFloat(openingAmount)
    console.log('[CashRegister] handleOpenRegister called, amount:', amount, 'openingAmount:', openingAmount)
    if (isNaN(amount) || amount < 0) {
      setErrorMsg('Ingresa un monto válido')
      return
    }
    setProcessing(true)
    setErrorMsg('')
    const result = await openRegister(amount, notesOpen)
    console.log('[CashRegister] openRegister result:', result)B
    setProcessing(false)
    if (result.success) {
      setShowOpenModal(false)
      setOpeningAmount('')
      setNotesOpen('')
    } else {
      setErrorMsg(result.error || 'Error al abrir caja')
    }
  }

  const handleCloseRegister = async () => {
    const amount = parseFloat(closingAmount)
    if (isNaN(amount) || amount < 0) {
      setErrorMsg('Ingresa un monto válido')
      return
    }
    setProcessing(true)
    setErrorMsg('')
    const result = await closeRegister(amount, notesClose)
    setProcessing(false)
    if (result.success) {
      setShowCloseModal(false)
      setClosingAmount('')
      setNotesClose('')
    } else {
      setErrorMsg(result.error || 'Error al cerrar caja')
    }
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Arqueo de Caja</h1>
            <p className="text-sm text-gray-500 mt-1">Controla la apertura y cierre de caja de tu sucursal</p>
          </div>

          {currentRegister ? (
            <button
              onClick={() => { setShowCloseModal(true); setErrorMsg('') }}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
            >
              <ArrowDownCircle className="w-5 h-5" />
              Cerrar Caja
            </button>
          ) : (
            <button
              onClick={() => { setShowOpenModal(true); setErrorMsg('') }}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
            >
              <ArrowUpCircle className="w-5 h-5" />
              Abrir Caja
            </button>
          )}
        </div>

        {/* Estado actual */}
        {currentRegister && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                <div>
                  <p className="font-semibold text-green-800">Caja Abierta</p>
                  <p className="text-sm text-green-600">
                    Desde {formatDate(currentRegister.opened_at)} · por {currentRegister.opened_by_name}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-green-600">Monto Apertura</p>
                <p className="text-xl font-bold text-green-800">{formatCurrency(currentRegister.opening_amount)}</p>
              </div>
            </div>
          </div>
        )}

        {!currentRegister && !isLoading && (
          <div className="bg-gray-100 border border-gray-200 rounded-lg p-4 text-center">
            <Wallet className="w-8 h-8 mx-auto text-gray-400 mb-2" />
            <p className="text-gray-600 font-medium">No hay caja abierta</p>
            <p className="text-sm text-gray-400">Abre una caja para comenzar a registrar ventas</p>
          </div>
        )}
      </div>

      {/* Historial */}
      <div className="flex-1 overflow-y-auto p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Historial de Arqueos</h2>

        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
            <p className="mt-4 text-gray-600">Cargando...</p>
          </div>
        ) : registers.length === 0 ? (
          <div className="text-center py-12">
            <Wallet className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-600">No hay arqueos registrados</p>
          </div>
        ) : (
          <div className="space-y-3">
            {registers.map((reg) => {
              const isClosed = reg.status === 'closed'
              const hasDiff = isClosed && reg.difference !== null && reg.difference !== 0

              return (
                <div
                  key={reg.id}
                  onClick={() => isClosed && setShowDetailModal(reg)}
                  className={`bg-white rounded-lg border overflow-hidden ${isClosed ? 'cursor-pointer hover:shadow-md' : ''} ${
                    !isClosed ? 'border-green-200' : hasDiff ? 'border-orange-200' : 'border-gray-200'
                  }`}
                >
                  <div className="px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        !isClosed ? 'bg-green-100' : hasDiff ? 'bg-orange-100' : 'bg-blue-100'
                      }`}>
                        {!isClosed ? (
                          <Clock className="w-5 h-5 text-green-600" />
                        ) : hasDiff ? (
                          <AlertTriangle className="w-5 h-5 text-orange-600" />
                        ) : (
                          <CheckCircle className="w-5 h-5 text-blue-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {formatDate(reg.opened_at)}
                          {isClosed && reg.closed_at && (
                            <span className="text-gray-400 font-normal"> → {formatDate(reg.closed_at)}</span>
                          )}
                        </p>
                        <p className="text-sm text-gray-500">
                          {reg.opened_by_name}
                          {isClosed && reg.closed_by_name && reg.closed_by_name !== reg.opened_by_name && (
                            <span> · Cerró: {reg.closed_by_name}</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      {isClosed && (
                        <>
                          <div className="text-right">
                            <p className="text-xs text-gray-400">Ventas</p>
                            <p className="font-semibold text-gray-900">{reg.sales_count || 0}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-400">Esperado</p>
                            <p className="font-semibold text-gray-900">{formatCurrency(reg.expected_amount || 0)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-400">Contado</p>
                            <p className="font-semibold text-gray-900">{formatCurrency(reg.closing_amount || 0)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-400">Diferencia</p>
                            <p className={`font-bold ${
                              (reg.difference || 0) > 0 ? 'text-green-600' : (reg.difference || 0) < 0 ? 'text-red-600' : 'text-gray-600'
                            }`}>
                              {(reg.difference || 0) > 0 ? '+' : ''}{formatCurrency(reg.difference || 0)}
                            </p>
                          </div>
                        </>
                      )}
                      {!isClosed && (
                        <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-medium rounded-full">
                          Abierta
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal: Abrir Caja */}
      {showOpenModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <ArrowUpCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Abrir Caja</h3>
                <p className="text-sm text-gray-500">Ingresa el monto inicial en efectivo</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto de Apertura *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={openingAmount}
                    onChange={handleAmountInput(setOpeningAmount)}
                    className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg text-lg font-semibold focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
                <textarea
                  value={notesOpen}
                  onChange={(e) => setNotesOpen(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                  placeholder="Observaciones..."
                />
              </div>

              {errorMsg && (
                <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{errorMsg}</p>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowOpenModal(false); setOpeningAmount(''); setNotesOpen(''); setErrorMsg('') }}
                className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleOpenRegister}
                disabled={processing}
                className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50"
              >
                {processing ? 'Abriendo...' : 'Abrir Caja'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Cerrar Caja */}
      {showCloseModal && currentRegister && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <ArrowDownCircle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Cerrar Caja</h3>
                <p className="text-sm text-gray-500">Contá el efectivo y registrá el cierre</p>
              </div>
            </div>

            {/* Info de apertura */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Abierta:</span>
                <span className="font-medium">{formatDate(currentRegister.opened_at)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Monto apertura:</span>
                <span className="font-bold text-gray-900">{formatCurrency(currentRegister.opening_amount)}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Monto Contado en Caja *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={closingAmount}
                    onChange={handleAmountInput(setClosingAmount)}
                    className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg text-lg font-semibold focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas (opcional)</label>
                <textarea
                  value={notesClose}
                  onChange={(e) => setNotesClose(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                  placeholder="Observaciones del cierre..."
                />
              </div>

              {errorMsg && (
                <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{errorMsg}</p>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setShowCloseModal(false); setClosingAmount(''); setNotesClose(''); setErrorMsg('') }}
                className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleCloseRegister}
                disabled={processing}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50"
              >
                {processing ? 'Cerrando...' : 'Cerrar Caja'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Detalle de Arqueo */}
      {showDetailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900">Detalle del Arqueo</h3>
              <button
                onClick={() => setShowDetailModal(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Horarios */}
              <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Apertura</p>
                  <p className="text-sm font-medium">{formatDate(showDetailModal.opened_at)}</p>
                  <p className="text-xs text-gray-500">{showDetailModal.opened_by_name}</p>
                </div>
                {showDetailModal.closed_at && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">Cierre</p>
                    <p className="text-sm font-medium">{formatDate(showDetailModal.closed_at)}</p>
                    <p className="text-xs text-gray-500">{showDetailModal.closed_by_name}</p>
                  </div>
                )}
              </div>

              {/* Montos */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-blue-600 mb-1">
                    <ArrowUpCircle className="w-4 h-4" />
                    <span className="text-xs font-medium">Apertura</span>
                  </div>
                  <p className="text-lg font-bold text-blue-900">{formatCurrency(showDetailModal.opening_amount)}</p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-purple-600 mb-1">
                    <ArrowDownCircle className="w-4 h-4" />
                    <span className="text-xs font-medium">Cierre (Contado)</span>
                  </div>
                  <p className="text-lg font-bold text-purple-900">{formatCurrency(showDetailModal.closing_amount || 0)}</p>
                </div>
              </div>

              {/* Ventas */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-green-600 mb-1">
                    <Banknote className="w-4 h-4" />
                    <span className="text-xs font-medium">Efectivo</span>
                  </div>
                  <p className="text-lg font-bold text-green-900">{formatCurrency(showDetailModal.cash_sales_total || 0)}</p>
                </div>
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-indigo-600 mb-1">
                    <CreditCard className="w-4 h-4" />
                    <span className="text-xs font-medium">Tarjeta/Otro</span>
                  </div>
                  <p className="text-lg font-bold text-indigo-900">{formatCurrency(showDetailModal.card_sales_total || 0)}</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-xs font-medium">Operaciones</span>
                  </div>
                  <p className="text-lg font-bold text-gray-900">{showDetailModal.sales_count || 0}</p>
                </div>
              </div>

              {/* Resultado */}
              <div className={`rounded-lg p-4 border ${
                (showDetailModal.difference || 0) === 0 
                  ? 'bg-green-50 border-green-200' 
                  : (showDetailModal.difference || 0) > 0 
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Monto Esperado</p>
                    <p className="text-lg font-bold">{formatCurrency(showDetailModal.expected_amount || 0)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-700">Diferencia</p>
                    <p className={`text-2xl font-bold ${
                      (showDetailModal.difference || 0) === 0 
                        ? 'text-green-600' 
                        : (showDetailModal.difference || 0) > 0 
                          ? 'text-blue-600'
                          : 'text-red-600'
                    }`}>
                      {(showDetailModal.difference || 0) > 0 ? '+' : ''}{formatCurrency(showDetailModal.difference || 0)}
                    </p>
                    {(showDetailModal.difference || 0) === 0 && (
                      <p className="text-xs text-green-600 mt-1">Cuadra perfecto</p>
                    )}
                    {(showDetailModal.difference || 0) > 0 && (
                      <p className="text-xs text-blue-600 mt-1">Sobrante</p>
                    )}
                    {(showDetailModal.difference || 0) < 0 && (
                      <p className="text-xs text-red-600 mt-1">Faltante</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Notas */}
              {(showDetailModal.notes_open || showDetailModal.notes_close) && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-2">
                  {showDetailModal.notes_open && (
                    <div>
                      <p className="text-xs font-medium text-yellow-700">Nota de apertura:</p>
                      <p className="text-sm text-yellow-800">{showDetailModal.notes_open}</p>
                    </div>
                  )}
                  {showDetailModal.notes_close && (
                    <div>
                      <p className="text-xs font-medium text-yellow-700">Nota de cierre:</p>
                      <p className="text-sm text-yellow-800">{showDetailModal.notes_close}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowDetailModal(null)}
              className="w-full mt-6 px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

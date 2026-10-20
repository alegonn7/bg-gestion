// Contrato común entre los módulos de transportista (correo-argentino.ts, andreani.ts, envia.ts).
// shipping-quote decide con cuál hablar y les pasa siempre la misma forma de datos.

export type QuoteInput = {
  originPostalCode: string
  originProvince?: string | null
  destinationPostalCode: string
  destinationProvince?: string | null
  weightGrams: number
  lengthCm: number
  widthCm: number
  heightCm: number
  // Valor de la mercadería (subtotal del carrito), para el seguro que cotiza Andreani.
  declaredValue: number
}

export type QuoteResult = {
  cost: number
  estimatedDays: number | null
  quoteReference: string | null
}

export type CarrierCredentials = Record<string, string>

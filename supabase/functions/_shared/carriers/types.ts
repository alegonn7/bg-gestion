// Contrato común entre los módulos de transportista (correo-argentino.ts, andreani.ts).
// shipping-quote decide con cuál hablar y les pasa siempre la misma forma de datos.

export type QuoteInput = {
  originPostalCode: string
  destinationPostalCode: string
  weightGrams: number
  lengthCm: number
  widthCm: number
  heightCm: number
}

export type QuoteResult = {
  cost: number
  estimatedDays: number | null
  quoteReference: string | null
}

export type CarrierCredentials = Record<string, string>

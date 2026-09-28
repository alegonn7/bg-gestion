// Remito: acompaña la entrega o el traslado de mercadería. No es factura: no cobra ni lleva CAE.
// 'X' = sin validez fiscal (documento no válido como factura); 'R' = con CAI de ARCA.

export type MotivoRemito = 'venta' | 'traslado' | 'devolucion' | 'sin_cargo' | 'otro'

export const MOTIVOS_REMITO: Record<MotivoRemito, string> = {
  venta: 'Venta',
  traslado: 'Traslado entre sucursales',
  devolucion: 'Devolución a proveedor',
  sin_cargo: 'Entrega sin cargo',
  otro: 'Otro',
}

export interface ItemRemito {
  codigo: string
  descripcion: string
  cantidad: number
}

export interface Remito {
  id: string
  branch_id: string | null
  tipo: 'X' | 'R'
  punto_venta: number
  numero: number
  fecha: string
  motivo: MotivoRemito
  sale_id: string | null
  destinatario_nombre: string | null
  destinatario_doc_tipo: number | null
  destinatario_doc_nro: string | null
  domicilio_entrega: string | null
  sucursal_destino_id: string | null
  transportista: string | null
  observaciones: string | null
  items: ItemRemito[]
  estado: 'emitido' | 'anulado'
  cai: string | null
  cai_vence: string | null
  created_at: string
}

export const numeroRemito = (r: Pick<Remito, 'tipo' | 'punto_venta' | 'numero'>) =>
  `${r.tipo} ${String(r.punto_venta).padStart(5, '0')}-${String(r.numero).padStart(8, '0')}`

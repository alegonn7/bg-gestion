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
  created_by_name: string | null      // quién lo hizo
  anulado_por_nombre: string | null   // quién lo anuló
  anulado_en: string | null
}

// CAI de ARCA para remitos R: autoriza un rango de números de un punto de venta hasta su vencimiento
export interface CaiRemito {
  id: string
  punto_venta: number | null    // null mientras se busca o crea el punto de venta
  cai: string | null            // null mientras ARCA procesa el pedido
  vencimiento: string | null    // YYYY-MM-DD
  desde: number | null
  hasta: number | null
  cantidad: number | null
  origen: 'automatico' | 'manual'
  estado: 'pendiente' | 'vigente' | 'error'
  paso: 'puntos_venta' | 'punto_venta' | 'cai' | null
  error: string | null
  created_at: string
}

export const numeroRemito = (r: Pick<Remito, 'tipo' | 'punto_venta' | 'numero'>) =>
  `${r.tipo} ${String(r.punto_venta).padStart(5, '0')}-${String(r.numero).padStart(8, '0')}`

// Modelo de cuenta de transferencia para punto de venta
export interface TransferAccount {
  id: string;
  nombre: string;
  alias?: string;
  cbu?: string;
  generica?: boolean;
}

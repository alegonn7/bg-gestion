// Ganancia de un producto como porcentaje sobre el costo: el mismo número que se carga al ponerle
// precio ("le gano un 30%"). Sin costo cargado no se puede calcular.
export function gananciaSobreCosto(costo: number, venta: number): number | null {
  return costo > 0 ? ((venta - costo) / costo) * 100 : null
}

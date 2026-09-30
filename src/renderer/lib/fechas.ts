// Fechas de los <input type="date"> ("YYYY-MM-DD").
// new Date("YYYY-MM-DD") las toma como medianoche UTC, que en Argentina es las 21 hs
// del día anterior: el filtro "hasta hoy" dejaba afuera todas las ventas de hoy.
// Estas funciones las interpretan en la hora local, como el resto de la app.

export const inicioDelDia = (fecha: string): Date => {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

export const finDelDia = (fecha: string): Date => {
  const [y, m, d] = fecha.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59, 999)
}

// "YYYY-MM-DD" de una fecha en hora local (toISOString da el día en UTC)
export const fechaLocalISO = (date: Date): string => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

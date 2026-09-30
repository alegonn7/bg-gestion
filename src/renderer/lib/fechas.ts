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

// Las columnas "timestamp without time zone" (sales, inventory_movements) vuelven de Supabase
// sin zona ("2026-09-30T17:24:30"), y new Date() las toma como hora local: una venta de las
// 22 hs aparecía a la 1 del día siguiente. Guardan UTC, así que se les agrega "+00:00".
export const utcDB = (fecha: string): string => {
  if (!fecha) return fecha
  if (/T.*(Z|[+-]\d{2}(:?\d{2})?)$/.test(fecha)) return fecha
  return fecha + '+00:00'
}

export const fechaDB = (fecha: string): Date => new Date(utcDB(fecha))

// Día (hora local) de una fecha de la base, para agrupar por día
export const diaLocalDB = (fecha: string): string => fechaLocalISO(fechaDB(fecha))

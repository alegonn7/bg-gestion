# Avances: Arqueo de Caja y Movimientos Extraordinarios

Fecha: 2026-02-20

Resumen corto:
- Se implementó la posibilidad de registrar "movimientos extraordinarios" (gastos o ingresos fuera de las ventas) vinculados a cada arqueo de caja.
- Los movimientos se guardan en la base de datos (tabla `extra_movements`) y tienen: tipo (`gasto`/`ingreso`), monto, descripción, usuario creador y timestamp.
- Se añadió UI para crear y listar movimientos (modal durante caja abierta) y un visor que combina ventas + movimientos extraordinarios por arqueo en orden cronológico.
- La lógica de cierre de caja ahora incluye estos movimientos al calcular el `expected_amount` y la `difference`.

Archivos principales modificados:
- `src/renderer/store/extra-movements.ts`  — nuevo store Zustand para `extra_movements` (fetch, add).
- `src/renderer/pages/CashRegister.tsx` — formularios y modales: `ExtraMovementForm`, `ExtraMovementsViewer`, botones y modales en la pantalla de Arqueo.
- `src/renderer/store/cash-register.ts` — ajuste en `closeRegister` para incluir ingresos/gastos extraordinarios en el cálculo esperado.

Dependencias y requisitos:
- Requiere la tabla en Supabase/Postgres: `public.extra_movements` con al menos los campos: `id`, `cash_register_id`, `type`, `amount`, `description`, `created_by`, `created_at`, `created_by_name` (nombre denormalizado opcional).
- Verificar permisos/RLS en Supabase para permitir inserciones y lecturas por los roles apropiados.

Impacto en negocio y operativa:
- Permite detectar con mayor precisión faltantes/sobrantes en cada arqueo.
- Mejora la trazabilidad de quien registró ajustes de caja (rendimiento de empleados, control de efectivo).
- Puede habilitarse como funcionalidad estándar; posteriormente podría extraerse reporte avanzado (métricas por empleado) como feature premium.

Siguientes pasos recomendados:
1. Crear la tabla `extra_movements` en la DB y configurar RLS (si no existe).
2. Probar flujo en entorno de desarrollo: abrir caja → registrar movimientos → cerrar caja y validar `expected_amount`.
3. Pulir UI/estilos del modal y agregar export/filtrado dentro del visor si se desea.
4. Añadir reportes por empleado/periodo y considerar como gancho comercial en planes de pago (reportes de performance/arqueos mensuales).

Notas técnicas rápidas:
- El visor combina las ventas (`sales`) y los movimientos extraordinarios en un solo listado cronológico. Para las ventas muestra `payment_method` y el monto; para movimientos extraordinarios muestra `tipo`, `monto`, `descripción` y `usuario`.
- En el cálculo de cierre se suman ingresos extraordinarios y se restan gastos extraordinarios al `expected_amount`.

Contacto: Equipo de desarrollo — actualizar la documentación si se realizan cambios de esquema.

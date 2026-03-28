
# BG Gestión — Plan de Negocios (Actualizado 2026)

## Resumen Ejecutivo

**BG Gestión** es un sistema SaaS de gestión de inventario y punto de venta (POS) para pequeños y medianos comercios argentinos. El sistema principal es una **aplicación de escritorio (Windows, Mac, Linux) desarrollada en Electron + React**, conectada a la nube mediante Supabase. El escaneo de productos se realiza ahora exclusivamente con un **escáner físico ProSoft S224 (USB HID)**, eliminando la app móvil anterior.

El diferencial es el soporte nativo para la economía argentina: **precios en ARS y USD, conversión automática dólar blue, multi-sucursal, y documentación fiscal**.

---

## Problema que Resolvemos

Los comercios argentinos (almacenes, kioscos, tiendas de ropa, ferreterías, etc.) enfrentan:

1. **Gestión dispersa**: Stock anotado en cuadernos, planillas Excel o nada
2. **Precios en dos monedas**: La economía argentina funciona con ARS y USD simultáneamente; pocos sistemas lo manejan nativamente
3. **Múltiples sucursales**: Comercios que crecen necesitan visibilidad unificada
4. **Costo alto**: Los sistemas existentes (Tango, Cuenta Digital, etc.) son costosos o complejos
5. **Operación diaria lenta**: Cargar ventas a mano, sin escáner integrado

---


## Propuesta de Valor

| Valor                  | Descripción                                                                 |
|------------------------|-----------------------------------------------------------------------------|
| **Multi-moneda nativo**| Precios en ARS, USD y conversión blue automática.                           |
| **Multi-sucursal**     | Catálogo maestro + stock y ventas por sucursal.                             |
| **Escáner físico**     | ProSoft S224 USB HID, rápido y sin errores de cámara/app.                   |
| **POS moderno**        | Punto de venta ágil, búsqueda, escaneo, descuentos, tickets PDF.            |
| **Fácil de usar**      | Interfaz moderna, sin capacitación compleja.                                |
| **SaaS accesible**     | Plan gratuito real, escalable según necesidades.                            |

---

## Público Objetivo

### Segmento Principal
- **Pequeños comercios independientes** en Argentina (1-3 sucursales)
- Almacenes, kioscos, tiendas de ropa, bazares, ferreterías, minimarkets
- 1-10 empleados
- Facturación mensual: ARS $500K — $10M

### Segmento Secundario
- **Medianos comercios** (3-10 sucursales)
- Franquicias pequeñas
- Distribuidores con control de stock

### Perfil del Usuario
- Dueño de comercio (30-55 años)
- Busca digitalizar su negocio sin complejidad
- Maneja precios en pesos y dólares
- Quiere visibilidad del stock desde cualquier sucursal

---

## Modelo de Ingresos

### Planes de Suscripción (mensual)

| Plan | Precio | Sucursales | Productos/Suc. | Usuarios/Suc. | Características |
|------|--------|-----------|----------------|---------------|-----------------|
| **Free** | $0 | 1 | 50 | 2 | POS, stock básico, tickets |
| **Basic** | $X/mes | 2 | 500 | 5 | + Reportes, categorías, scanner |
| **Pro** | $XX/mes | 5 | 2.000 | 10 | + Catálogo maestro, multi-moneda completo |
| **Enterprise** | $XXX/mes | Ilimitado | Ilimitado | Ilimitado | + Soporte prioritario, customizaciones |

> Los precios se definirán según estudio de mercado. Referencia: competidores cobran entre USD 10-50/mes.

### Fuentes de Ingreso Futuras
- **Add-ons premium**: Integraciones con AFIP, MercadoLibre, Rappi
- **Whitelabel**: Para distribuidores que quieran su propia marca
- **Soporte/Consultoría**: Setup inicial, migración de datos

---

## Análisis Competitivo

| Competidor | Fortaleza | Debilidad vs BG Gestión |
|-----------|-----------|-------------------------|
| **Tango Gestión** | Muy completo, conocido | Caro, complejo, sin multi-moneda real |
| **Cuenta Digital** | Integrado con AFIP | Solo web, lento, sin dólar blue |
| **Alegra** | Cloud, bonito | No pensado para Argentina, sin USD |
| **Planillas Excel** | Gratis, familiar | No escala, sin POS, sin stock real |
| **Cuaderno** | Sin costo | Cero visibilidad, pérdida de datos |


### Ventajas Competitivas de BG Gestión
1. Multi-moneda con dólar blue automático.
2. Escáner físico rápido y robusto.
3. Multi-sucursal real desde el inicio.
4. Interfaz moderna y simple.
5. Plan gratuito real.

---

## Tecnología


### Arquitectura
- **Desktop**: Electron 28, React 18, TypeScript 5, Vite, Tailwind, Zustand.
- **Escáner**: ProSoft S224 (USB HID, actúa como teclado).
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Realtime).
- **Infraestructura**: 100% cloud, sin servidor propio.
- **PDF**: jsPDF para tickets.
- **Gráficos**: Recharts.

### Costos de Infraestructura
- **Supabase Free**: Hasta ~10K usuarios, suficiente para MVP
- **Supabase Pro**: USD 25/mes cuando escale
- **Dominio + Landing**: ~USD 15/año
- **Costo marginal por cliente**: Muy bajo (Supabase escala bien)

---


## Roadmap (2026)

- MVP completo: Auth, multi-sucursal, POS, stock, reportes, escáner físico, cotización blue, tickets PDF.
- Mejoras próximas: alertas de stock, import/export CSV, actualización masiva de precios, modo oscuro.
- Futuro: facturación electrónica AFIP, integraciones MercadoPago/MercadoLibre, API pública, multi-idioma.

---

## Métricas Clave (KPIs)

| Métrica | Descripción |
|---------|-------------|
| **MRR** | Ingreso recurrente mensual |
| **Usuarios activos diarios** | Usuarios que abren el programa por día |
| **Ventas procesadas/mes** | Cantidad de ventas registradas |
| **Churn rate** | % de usuarios que cancelan suscripción |
| **Conversión Free → Paid** | % de usuarios free que pasan a plan pago |
| **Sucursales promedio** | Promedio de sucursales por organización |

---

## Equipo

| Rol | Descripción |
|-----|-------------|
| **Desarrollo** | Desarrollo full-stack (Electron + React + Supabase + React Native) |
| **Producto** | Definición de features basada en feedback de comerciantes |
| **Soporte** | Atención al cliente para setup y uso diario |

---

## Resumen

BG Gestión apunta a ser la **herramienta de gestión de referencia para comercios argentinos**, combinando facilidad de uso con funcionalidades pensadas para la realidad local (multi-moneda, dólar blue, multi-sucursal). El modelo SaaS con plan gratuito permite tracción orgánica, y la arquitectura cloud-first minimiza costos de infraestructura.

---


## Cambios y Notas Importantes

- **La app móvil fue deprecada**: el escaneo ahora es solo con hardware físico, lo que mejora la velocidad y confiabilidad.
- **Movimientos extraordinarios y arqueo de caja**: permite registrar gastos/ingresos fuera de ventas, con visor cronológico y reportes avanzados (feature premium).
- **Actualizaciones automáticas**: el sistema se actualiza solo vía GitHub Releases.    


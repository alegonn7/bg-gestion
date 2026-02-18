# BG Gestión — Plan de Negocios

## Resumen Ejecutivo

**BG Gestión** es un sistema SaaS de gestión de inventario y punto de venta diseñado para **pequeños y medianos comercios argentinos**. Combina un programa de escritorio (Windows/Mac/Linux) con una app móvil de escaneo, todo conectado en la nube a través de Supabase.

El diferencial principal es el soporte nativo para la **realidad económica argentina**: precios en pesos y dólares, cotización dólar blue automática, y documentación fiscal adecuada.

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

| Valor | Descripción |
|-------|-------------|
| **Multi-moneda nativo** | Precios en ARS, USD, y conversión automática al dólar blue |
| **Multi-sucursal** | Catálogo maestro compartido + stock independiente por sucursal |
| **Escáner móvil** | El celular funciona como lector de códigos de barras en tiempo real |
| **POS rápido** | Punto de venta con búsqueda, escaneo, descuentos y tickets PDF |
| **Fácil de usar** | Interfaz moderna, sin capacitación compleja |
| **SaaS accesible** | Plan gratuito para empezar, planes escalables |

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
1. Multi-moneda con dólar blue automático (único en el mercado)
2. Escáner móvil en tiempo real (sin hardware extra)
3. Multi-sucursal desde el día 1
4. Interfaz moderna tipo app (no parece software de los 90)
5. Plan gratuito real para captar usuarios

---

## Tecnología

### Arquitectura
- **Desktop**: Electron + React + TypeScript
- **Móvil**: React Native + Expo (escáner)
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Storage)
- **Sin servidor propio**: Supabase maneja todo el backend

### Costos de Infraestructura
- **Supabase Free**: Hasta ~10K usuarios, suficiente para MVP
- **Supabase Pro**: USD 25/mes cuando escale
- **Dominio + Landing**: ~USD 15/año
- **Costo marginal por cliente**: Muy bajo (Supabase escala bien)

---

## Roadmap

### Fase 1 — MVP (Actual) ✅
- [x] Auth con roles (owner, admin, manager, employee)
- [x] CRUD productos con stock y precios ARS/USD
- [x] POS con carrito, descuentos, métodos de pago
- [x] Historial de ventas con tickets PDF
- [x] Multi-sucursal con catálogo maestro
- [x] Gestión de usuarios e invitaciones
- [x] Categorías de productos
- [x] Movimientos de inventario
- [x] Escáner móvil via Supabase Realtime
- [x] Reportes con gráficos
- [x] Cotización dólar blue automática
- [x] Logo de empresa en tickets
- [x] Instalador Windows (.exe)

### Fase 2 — Mejoras Core (Próximo)
- [ ] Alertas de stock bajo/crítico (notificaciones en dashboard)
- [ ] Importar productos desde CSV
- [ ] Exportar productos/ventas a CSV
- [ ] Duplicar producto rápido
- [ ] Actualización masiva de precios (por %, categoría, etc.)
- [ ] Dashboard con datos reales (hoy tiene valores hardcodeados)
- [ ] Modo oscuro

### Fase 3 — Crecimiento
- [ ] Landing page + onboarding web
- [ ] Facturación electrónica AFIP
- [ ] Integración MercadoPago
- [ ] App móvil completa (no solo escáner)
- [ ] Notificaciones push
- [ ] Shortcuts de teclado en POS

### Fase 4 — Escala
- [ ] Panel de super-admin (gestión de todos los tenants)
- [ ] API pública para integraciones
- [ ] Integración MercadoLibre / Rappi
- [ ] Marketplace de add-ons
- [ ] Multi-idioma (español, portugués)

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

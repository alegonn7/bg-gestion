# BG Gestión — Historias de Usuario (Índice)

## Convención de IDs

```
HU-[MÓDULO]-[N]
```

Módulos: AUTH, ORG, SUC, USR, CAT, PROD, MASTER, POS, VENTA, INV, SCAN, REPORT, CONFIG

---

## Estado: ✅ Implementado | ⬚ Pendiente

---

## AUTH — Autenticación

| ID | Historia | Estado |
|----|----------|--------|
| HU-AUTH-1 | Iniciar sesión con email y contraseña | ✅ |
| HU-AUTH-2 | Mantener sesión activa (JWT) | ✅ |
| HU-AUTH-3 | Cerrar sesión | ✅ |
| HU-AUTH-4 | Redirigir según estado de autenticación | ✅ |

## ORG — Organización

| ID | Historia | Estado |
|----|----------|--------|
| HU-ORG-1 | Ver información de la organización | ✅ |
| HU-ORG-2 | Editar nombre de la organización | ✅ |
| HU-ORG-3 | Subir logo de la organización | ✅ |
| HU-ORG-4 | Eliminar logo de la organización | ✅ |

## SUC — Sucursales

| ID | Historia | Estado |
|----|----------|--------|
| HU-SUC-1 | Ver listado de sucursales | ✅ |
| HU-SUC-2 | Crear nueva sucursal | ✅ |
| HU-SUC-3 | Editar sucursal | ✅ |
| HU-SUC-4 | Desactivar sucursal | ✅ |
| HU-SUC-5 | Ver detalle de sucursal (estadísticas) | ✅ |
| HU-SUC-6 | Seleccionar sucursal activa | ✅ |

## USR — Usuarios

| ID | Historia | Estado |
|----|----------|--------|
| HU-USR-1 | Ver listado de usuarios | ✅ |
| HU-USR-2 | Invitar nuevo empleado (con creds temporales) | ✅ |
| HU-USR-3 | Editar usuario (nombre, rol, sucursal) | ✅ |
| HU-USR-4 | Desactivar usuario | ✅ |
| HU-USR-5 | Ver detalle de usuario | ✅ |
| HU-USR-6 | Filtrar usuarios por rol y sucursal | ✅ |

## CAT — Categorías

| ID | Historia | Estado |
|----|----------|--------|
| HU-CAT-1 | Ver listado de categorías | ✅ |
| HU-CAT-2 | Crear categoría con nombre y color | ✅ |
| HU-CAT-3 | Editar categoría | ✅ |
| HU-CAT-4 | Eliminar categoría | ✅ |

## PROD — Productos (por Sucursal)

| ID | Historia | Estado |
|----|----------|--------|
| HU-PROD-1 | Ver listado de productos de la sucursal | ✅ |
| HU-PROD-2 | Crear producto en sucursal (barcode, nombre, precios, stock) | ✅ |
| HU-PROD-3 | Editar producto (precios, stock, datos) | ✅ |
| HU-PROD-4 | Eliminar/desactivar producto | ✅ |
| HU-PROD-5 | Ver detalle de producto con historial | ✅ |
| HU-PROD-6 | Buscar producto por nombre o código | ✅ |
| HU-PROD-7 | Filtrar productos por categoría | ✅ |
| HU-PROD-8 | Duplicar producto existente | ⬚ |
| HU-PROD-9 | Importar productos desde CSV | ⬚ |
| HU-PROD-10 | Exportar productos a CSV | ⬚ |
| HU-PROD-11 | Actualización masiva de precios | ⬚ |

## MASTER — Catálogo Maestro

| ID | Historia | Estado |
|----|----------|--------|
| HU-MASTER-1 | Ver catálogo maestro de la organización | ✅ |
| HU-MASTER-2 | Crear producto en catálogo maestro | ✅ |
| HU-MASTER-3 | Editar producto del catálogo maestro | ✅ |
| HU-MASTER-4 | Buscar en catálogo maestro | ✅ |
| HU-MASTER-5 | Filtrar catálogo por categoría | ✅ |
| HU-MASTER-6 | Ver detalle de producto maestro | ✅ |

## POS — Punto de Venta

| ID | Historia | Estado |
|----|----------|--------|
| HU-POS-1 | Buscar producto para agregar al carrito | ✅ |
| HU-POS-2 | Escanear código de barras (webcam) | ✅ |
| HU-POS-3 | Agregar producto al carrito | ✅ |
| HU-POS-4 | Modificar cantidad en el carrito | ✅ |
| HU-POS-5 | Eliminar producto del carrito | ✅ |
| HU-POS-6 | Aplicar descuento a la venta | ✅ |
| HU-POS-7 | Seleccionar modo de precio (ARS/USD/Blue) | ✅ |
| HU-POS-8 | Vaciar carrito completo | ✅ |

## VENTA — Checkout y Ventas

| ID | Historia | Estado |
|----|----------|--------|
| HU-VENTA-1 | Completar venta con método de pago | ✅ |
| HU-VENTA-2 | Pago mixto (efectivo + tarjeta) | ✅ |
| HU-VENTA-3 | Calcular vuelto automáticamente | ✅ |
| HU-VENTA-4 | Generar ticket PDF al finalizar venta | ✅ |
| HU-VENTA-5 | Ver historial de ventas con filtros | ✅ |
| HU-VENTA-6 | Descargar ticket PDF desde historial | ✅ |
| HU-VENTA-7 | Exportar ventas a CSV | ⬚ |

## INV — Inventario

| ID | Historia | Estado |
|----|----------|--------|
| HU-INV-1 | Registrar entrada de stock | ✅ |
| HU-INV-2 | Registrar salida de stock | ✅ |
| HU-INV-3 | Registrar ajuste de inventario | ✅ |
| HU-INV-4 | Ver historial de movimientos de un producto | ✅ |
| HU-INV-5 | Descuento automático de stock al vender | ✅ |
| HU-INV-6 | Alertas de stock bajo | ⬚ |
| HU-INV-7 | Alertas de stock crítico | ⬚ |

## ~~SCAN — Escáner Móvil~~ (DEPRECADO - 5/3/2026, reemplazado por escáner físico ProSoft S224)

| ID | Historia | Estado |
|----|----------|--------|
| ~~HU-SCAN-1~~ | ~~Escanear código desde app móvil~~ | DEPRECADO |
| ~~HU-SCAN-2~~ | ~~Recibir escaneo en tiempo real (desktop)~~ | DEPRECADO |
| ~~HU-SCAN-3~~ | ~~Ver historial de escaneos~~ | DEPRECADO |
| ~~HU-SCAN-4~~ | ~~Identificar dispositivo (desktop vs mobile)~~ | DEPRECADO |

## REPORT — Reportes

| ID | Historia | Estado |
|----|----------|--------|
| HU-REPORT-1 | Ver reporte de ingresos por período | ✅ |
| HU-REPORT-2 | Ver top productos más vendidos | ✅ |
| HU-REPORT-3 | Ver gráficos de ventas | ✅ |
| HU-REPORT-4 | Ver alertas de stock en reportes | ✅ |

## CONFIG — Configuración

| ID | Historia | Estado |
|----|----------|--------|
| HU-CONFIG-1 | Editar nombre de la empresa | ✅ |
| HU-CONFIG-2 | Subir/eliminar logo de empresa | ✅ |
| HU-CONFIG-3 | Ver cotización dólar blue actual | ✅ |
| HU-CONFIG-4 | Refrescar cotización dólar blue | ✅ |
| HU-CONFIG-5 | Ver datos del usuario logueado | ✅ |
| HU-CONFIG-6 | Activar modo oscuro | ⬚ |

## UI — Interfaz General

| ID | Historia | Estado |
|----|----------|--------|
| HU-UI-1 | Navegación por menú lateral según rol | ✅ |
| HU-UI-2 | Dashboard con métricas del negocio | ⬚ |
| HU-UI-3 | Shortcuts de teclado en POS | ⬚ |

---

## Resumen

| Estado | Cantidad |
|--------|----------|
| ✅ Implementado | 62 |
| ⬚ Pendiente | 12 |
| **Total** | **74** |

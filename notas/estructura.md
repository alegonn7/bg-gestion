# BG Gestión — Arquitectura del Sistema

## Visión General

BG Gestión es un sistema SaaS multi-tenant de gestión de inventario y punto de venta para comercios argentinos. Consta de un **programa de escritorio (Electron)** como sistema principal, con soporte para **escáner físico de códigos de barras** (ProSoft S224).

---

## Componentes del Sistema

### 1. Programa de Escritorio (Electron)

Aplicación instalable para Windows (y compilable para Mac/Linux):

- Gestión completa de productos, stock, categorías, sucursales y usuarios
- Punto de Venta (POS) con soporte multi-moneda (ARS / USD / conversión Blue)
- Historial de ventas con generación de tickets PDF
- Reportes con gráficos (ingresos, top productos, alertas stock, etc.)
- Configuración de empresa (nombre, logo para tickets)
- Cotización dólar blue automática (dolarapi.com)
- Soporte para escáner físico ProSoft S224 (entrada por teclado/HID)

### 2. Backend (Supabase)

- **PostgreSQL**: Base de datos principal
- **Supabase Auth**: Autenticación con email/password + JWT
- **Supabase Storage**: Almacenamiento de logos de empresa
- **Row Level Security (RLS)**: Aislamiento de datos por organización/sucursal

---

## Jerarquía de Entidades

```
ORGANIZACIÓN (Negocio/Cliente)
├── Plan: free / basic / pro / enterprise
├── Logo de empresa (Supabase Storage)
├── Catálogo Maestro (productos compartidos entre sucursales)
├── Categorías (nivel organización)
│
├── SUCURSAL 1
│   ├── Productos (del maestro + propios) con stock y precios locales
│   ├── Ventas (POS)
│   ├── Movimientos de inventario
│   ├── Items escaneados (desde app móvil)
│   └── Empleados asignados
│
├── SUCURSAL 2
│   └── ...
│
└── USUARIOS
    ├── Owner — ve y administra todo
    ├── Admin — ve todo, no crea sucursales
    ├── Manager — administra su sucursal asignada
    └── Employee — opera POS, escanea, registra movimientos
```

---

## Stack Tecnológico

### Programa de Escritorio

| Capa | Tecnología |
|------|-----------|
| Shell | Electron 28 |
| Frontend | React 18 + TypeScript 5.3 |
| Bundler | Vite 5 |
| CSS | Tailwind CSS 3.4 |
| State | Zustand 4 (11 stores) |
| Gráficos | Recharts 3.7 |
| PDF | jsPDF 4.1 |
| Iconos | Lucide React |
| Empaquetado | electron-builder (NSIS para Windows) |

### App Móvil (Escáner) — DEPRECADA

| Capa | Tecnología |
|------|-----------|
| ~~Framework~~ | ~~React Native + Expo~~ |
| ~~Escáner~~ | ~~expo-barcode-scanner~~ |
| ~~Backend~~ | ~~Supabase (inserción directa en `scanned_items`)~~ |

> **NOTA:** La app móvil fue reemplazada por un escáner físico ProSoft S224 (5 de marzo de 2026).

### Backend

| Servicio | Uso |
|----------|-----|
| Supabase Auth | Autenticación JWT |
| Supabase PostgreSQL | Base de datos principal |
| Supabase Storage | Logos de empresa (bucket `organization-logos`) |
| API externa | dolarapi.com (cotización dólar blue) |

---

## Estructura del Proyecto

```
inventario-saas/
├── src/
│   ├── main/
│   │   ├── main.js            # Proceso principal Electron
│   │   └── preload.js         # Expone APIs al renderer (deviceId)
│   └── renderer/
│       ├── App.tsx             # Entry point: auth check → Login o Dashboard
│       ├── main.tsx            # Mount React
│       ├── index.css           # Tailwind imports
│       │
│       ├── pages/
│       │   ├── Login.tsx       # Formulario de login
│       │   ├── Dashboard.tsx   # Layout principal + routing manual
│       │   ├── Products.tsx    # CRUD productos por sucursal
│       │   ├── MasterCatalog.tsx # Catálogo maestro (owner/admin)
│       │   ├── POS.tsx         # Punto de Venta
│       │   ├── SalesHistory.tsx # Historial de ventas + PDF
│       │   ├── Branches.tsx    # Gestión de sucursales
│       │   ├── Users.tsx       # Gestión de usuarios
│       │   ├── Reports.tsx     # Reportes con gráficos
│       │   ├── ScannerPage.tsx # DEPRECADO (reemplazado por escáner físico)
│       │   └── Settings.tsx    # Configuración: empresa, logo, dólar
│       │
│       ├── components/         # 15 modales y componentes
│       │   ├── ProductCard.tsx
│       │   ├── CreateProductModal.tsx
│       │   ├── EditProductModal.tsx
│       │   ├── ProductDetailModal.tsx
│       │   ├── MasterProductDetailModal.tsx
│       │   ├── InventoryMovementModal.tsx
│       │   ├── MovementHistoryModal.tsx
│       │   ├── ManageCategoriesModal.tsx
│       │   ├── CheckoutModal.tsx
│       │   ├── CreateBranchModal.tsx
│       │   ├── EditBranchModal.tsx
│       │   ├── BranchDetailModal.tsx
│       │   ├── InviteUserModal.tsx
│       │   ├── EditUserModal.tsx
│       │   └── UserDetailModal.tsx
│       │
│       ├── store/              # 11 stores Zustand
│       │   ├── auth.ts
│       │   ├── products.ts
│       │   ├── pos.ts
│       │   ├── sales.ts
│       │   ├── branches.ts
│       │   ├── users.ts
│       │   ├── categories.ts
│       │   ├── dollar.ts
│       │   ├── master-catalog.ts
│       │   ├── reports.ts
│       │   └── scanner.ts      # DEPRECADO (reemplazado por escáner físico)
│       │
│       └── lib/
│           └── supabase.ts     # Cliente Supabase + tipos
│
├── build/icons/
├── release/
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

---

## Modelo de Datos (PostgreSQL — Supabase)

### organizations
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID PK | |
| name | VARCHAR(200) | Nombre del negocio |
| slug | VARCHAR(100) UNIQUE | Para URLs |
| plan | VARCHAR(50) | free, basic, pro, enterprise |
| subscription_status | VARCHAR(50) | active, suspended, cancelled, trial |
| max_branches | INTEGER | Límite de sucursales |
| max_products_per_branch | INTEGER | Límite de productos por sucursal |
| max_users_per_branch | INTEGER | Límite de usuarios por sucursal |
| logo_url | TEXT | URL del logo en Supabase Storage |
| is_active | BOOLEAN | |

### branches
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID PK | |
| organization_id | UUID FK | → organizations |
| name | VARCHAR(200) | |
| address | TEXT | |
| phone | VARCHAR(50) | |
| is_active | BOOLEAN | |

### users
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID PK | |
| auth_id | UUID UNIQUE | → auth.users de Supabase |
| email | VARCHAR(255) UNIQUE | |
| full_name | VARCHAR(200) | |
| organization_id | UUID FK | → organizations |
| branch_id | UUID FK | → branches (NULL = acceso a todas) |
| role | VARCHAR(50) | owner, admin, manager, employee |
| is_active | BOOLEAN | |
| last_login_at | TIMESTAMP | |

### products (Catálogo Maestro)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID PK | |
| organization_id | UUID FK | → organizations |
| barcode | VARCHAR(50) | Código de barras |
| sku | VARCHAR(50) | SKU interno |
| name | VARCHAR(200) | |
| description | TEXT | |
| category_id | UUID FK | → categories |
| is_active | BOOLEAN | |

### products_branch (Stock y Precios por Sucursal)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID PK | |
| product_id | UUID FK | → products |
| branch_id | UUID FK | → branches |
| barcode | VARCHAR(50) | Override de código |
| price_cost | DECIMAL | Precio costo ARS |
| price_sale | DECIMAL | Precio venta ARS |
| price_cost_usd | DECIMAL | Precio costo USD |
| price_sale_usd | DECIMAL | Precio venta USD |
| stock_quantity | INTEGER | Stock actual |
| stock_min | INTEGER | Stock mínimo |
| version | INTEGER | Control de versión |
| is_active | BOOLEAN | |

### categories
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID PK | |
| organization_id | UUID FK | → organizations |
| name | VARCHAR(100) | |
| color | VARCHAR(7) | Color hex |
| is_active | BOOLEAN | |

### sales
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID PK | |
| branch_id | UUID FK | → branches |
| total | DECIMAL | Total final |
| subtotal | DECIMAL | Subtotal antes de descuento |
| discount | DECIMAL | Monto de descuento |
| payment_method | VARCHAR(50) | Efectivo, Tarjeta, Mixto |
| cash_amount | DECIMAL | Monto en efectivo |
| card_amount | DECIMAL | Monto en tarjeta |
| price_mode | VARCHAR(20) | ars, usd, usd_to_ars |
| blue_rate | DECIMAL | Cotización blue al momento de la venta |
| created_by | UUID FK | → users |
| created_at | TIMESTAMP | |

### sale_items
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID PK | |
| sale_id | UUID FK | → sales |
| product_branch_id | UUID FK | → products_branch |
| quantity | INTEGER | |
| price | DECIMAL | Precio unitario |
| cost | DECIMAL | Costo unitario |
| subtotal | DECIMAL | |

### inventory_movements
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID PK | |
| product_branch_id | UUID FK | → products_branch |
| transaction_type | VARCHAR(50) | entry, exit, adjustment, sale |
| quantity | INTEGER | |
| reason | VARCHAR(100) | Motivo del movimiento |
| reference_id | UUID | Referencia a venta u otro |
| created_by | UUID FK | → users |
| created_at | TIMESTAMP | |

### scanned_items — DEPRECADA (ya no se usa desde 5/3/2026)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | UUID PK | |
| barcode | VARCHAR(50) | Código escaneado |
| product_branch_id | UUID FK | → products_branch |
| branch_id | UUID FK | → branches |
| scanned_by | UUID FK | → users |
| device_id | VARCHAR(100) | ID del dispositivo |
| device_type | VARCHAR(50) | desktop, mobile |
| is_viewed | BOOLEAN | Si ya fue revisado |
| created_at | TIMESTAMP | |

---

## Flujo de Autenticación

```
1. Usuario abre el programa → App.tsx ejecuta checkAuth()
2. Supabase Auth verifica la sesión JWT
3. Si hay sesión → consulta users + organizations + branches
4. Se establece: user, organization, branches[], selectedBranch
5. Se muestra Dashboard con menú filtrado por rol
6. Si no hay sesión → se muestra Login.tsx
```

### Invitación de empleados

```
1. Owner/Admin abre Usuarios → "Invitar empleado"
2. Completa: email, contraseña temporal, nombre, rol, sucursal
3. Se usa supabaseAdmin (service role) para crear usuario en Auth
4. Se inserta en tabla users con datos y rol
5. El empleado inicia sesión con esas credenciales
```

---

## Sistema de Precios Multi-Moneda

| Modo | Descripción |
|------|-------------|
| `ars` | Precio en pesos argentinos |
| `usd` | Precio en dólares |
| `usd_to_ars` | Precio USD convertido a ARS usando cotización Blue |

Cada producto tiene 4 campos de precio: `price_cost`, `price_sale`, `price_cost_usd`, `price_sale_usd`.
La cotización blue se obtiene de `dolarapi.com/v1/dolares/blue` con cache de 5 minutos.

---

## ~~Comunicación Desktop ↔ Móvil~~ (DEPRECADO)

> Esta sección fue deprecada el 5 de marzo de 2026. La app móvil fue reemplazada por un escáner físico ProSoft S224 que funciona como entrada HID (teclado) directamente en el campo de código de barras del POS.

~~```
App Móvil (escáner)
      │
      │ INSERT → scanned_items (barcode, branch_id, device_type='mobile')
      ▼
  Supabase PostgreSQL
      │
      │ Realtime (WebSocket: escucha INSERT en scanned_items)
      ▼
Programa Electron (ScannerPage)
      │
      └─ Muestra el producto escaneado en tiempo real
```~~

---

## Tickets / Comprobantes PDF

Formato de ticket térmico (80mm) generado con jsPDF:

1. Logo de la empresa (si existe)
2. Nombre de la empresa
3. Nombre de la sucursal
4. "COMPROBANTE DE VENTA"
5. "DOCUMENTO NO VALIDO COMO FACTURA"
6. Fecha y hora
7. Listado de productos con cantidad y precio
8. Subtotal, descuento (si hay), total
9. Método de pago con detalle de vuelto
10. "Gracias por su compra!"
11. Leyenda legal: *"Este ticket no tiene validez fiscal. Segun Ley 11.683, RG AFIP 1415"*

---

## Estado Actual

### Implementado ✅
- Auth completo (login, sesión, roles, invitación)
- CRUD productos (por sucursal + catálogo maestro)
- Categorías (crear, editar, eliminar, asignar)
- Sucursales (crear, editar, desactivar, stats)
- Usuarios (invitar, editar, desactivar, roles)
- Movimientos de inventario (entrada, salida, ajuste)
- POS con carrito, descuentos, multi-moneda
- Historial de ventas con filtros y PDF
- Reportes con gráficos
- Scanner físico ProSoft S224 (reemplaza app móvil y webcam)
- Cotización dólar blue automática
- Logo de empresa en tickets
- Tickets con leyenda no fiscal

### Pendiente ⬚
- Alertas de stock bajo/crítico
- Importar/exportar productos CSV
- Duplicar producto
- Actualización masiva de precios
- Dashboard con datos reales
- Modo oscuro

---

## Cambios recientes: Arqueo de Caja y Movimientos Extraordinarios

- Se añadió soporte para registrar "movimientos extraordinarios" asociados a un arqueo de caja: gastos o ingresos que no provienen directamente de una venta.
- Nuevo store: `useExtraMovementsStore` para gestionar `extra_movements` (fetch por caja, alta de movimiento).
- Nueva UI en la página de `Arqueo de Caja` (`src/renderer/pages/CashRegister.tsx`):
    - Modal para crear movimientos extraordinarios mientras la caja está abierta.
    - Visor por arqueo que combina las `sales` con los `extra_movements` en orden cronológico.
- Cálculo de cierre: la función de cierre de caja ahora incluye ingresos extraordinarios y resta gastos extraordinarios al `expected_amount`, afectando la `difference` mostrada.

Notas operativas:
- Es necesario crear la tabla `extra_movements` en la base de datos si aún no existe y revisar RLS/permissions.
- Recomendación: probar en entorno de desarrollo antes de desplegar a producción.

- Shortcuts de teclado
- Panel de super admin

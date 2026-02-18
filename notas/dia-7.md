# 📋 Documentación de Progreso - Sesión 7
## 📅 Fecha: 17 de Febrero, 2026

> **Punto de partida:** dia-6.md  
> Al inicio de esta sesión el sistema contaba con: Auth, Sucursales, Usuarios, Productos, Categorías, Movimientos, Catálogo Maestro, Reportes, POS, Historial de Ventas, Sistema de Escaneo Inalámbrico (PC + App Android).

---

## 🎯 Objetivo de la Sesión
Implementar el **sistema de precios en dólares (USD)** con conversión automática Blue, **selector de modo de precio en el POS**, **página de Configuración**, **sidebar colapsable**, **branding completo (BG Gestión + Binary Goats)** y **mejora de UX en la app móvil**.

---

## 💵 1. Precios en Dólares (USD)

### Campos nuevos en `products_branch`
```
price_cost_usd    numeric    Precio de costo en dólares (manual)
price_sale_usd    numeric    Precio de venta en dólares (manual)
```

> Estos campos se agregan junto a los ya existentes `price_cost` y `price_sale` (en ARS). El usuario carga manualmente los precios en USD y el sistema convierte automáticamente usando la cotización del dólar blue.

### Store del Dólar (`src/renderer/store/dollar.ts`) ✅ NUEVO

**Responsabilidades:**
- Obtener la cotización del dólar blue en tiempo real
- Cachear durante 5 minutos para no hacer requests innecesarios
- Proveer función de conversión USD → ARS
- Doble fuente: API primaria + fallback

**Estado:**
```typescript
interface DollarState {
  blueRate: number | null        // Precio venta del dólar blue
  blueBuyRate: number | null     // Precio compra del dólar blue
  lastUpdated: string | null     // Fecha última actualización
  isLoading: boolean
  error: string | null
  fetchBlueRate: () => Promise<void>
  convertUsdToArs: (usd: number) => number | null
}
```

**APIs utilizadas:**
1. **Primaria:** `https://dolarapi.com/v1/dolares/blue` → devuelve `{ compra, venta, fechaActualizacion }`
2. **Fallback:** `https://api.bluelytics.com.ar/v2/latest` → devuelve `{ blue: { value_buy, value_sell } }`

**Lógica de caché:**
```typescript
// No refetchear si ya tenemos datos de hace menos de 5 minutos
const diff = Date.now() - new Date(lastUpdated).getTime()
if (diff < 5 * 60 * 1000) return
```

### Archivos modificados para precios USD

| Archivo | Cambios |
|---|---|
| `store/products.ts` | Tipo `Product` incluye `price_cost_usd`, `price_sale_usd`. Queries seleccionan los campos. Create y Update los persisten. |
| `components/CreateProductModal.tsx` | 2 inputs nuevos: "Costo (USD)" y "Venta (USD)" con prefijo `US$`. Preview de conversión inline: `≈ $X ARS` |
| `components/EditProductModal.tsx` | Mismos inputs USD editables, prellenados con los valores existentes. |
| `components/ProductCard.tsx` | Sección púrpura centrada con conversión Blue (Costo y Venta). Layout flex con divider vertical. |
| `components/ProductDetailModal.tsx` | Sección púrpura con conversión `text-xl font-bold`, USD crudo debajo en `text-xs`. |
| `pages/ScannerPage.tsx` | Cards púrpura para Costo/Venta USD→ARS en el último escaneo y en items del historial. |

---

## 🏷️ 2. Selector de Modo de Precio en el POS

### Tres modos de precio

| Modo | Clave | Cálculo | Color UI |
|---|---|---|---|
| Pesos (ARS) | `ars` | `price_sale` tal cual | 🔵 Azul |
| Dólares (USD) | `usd` | `price_sale_usd` sin convertir | 🟢 Verde |
| USD → ARS (Blue) | `usd_to_ars` | `price_sale_usd × blueRate` | 🟣 Púrpura |

### Store modificado (`src/renderer/store/pos.ts`) ✏️ MODIFICADO

**Tipo:**
```typescript
export type PriceMode = 'ars' | 'usd' | 'usd_to_ars'
```

**Nuevas funciones exportadas:**
```typescript
// Calcula el precio según el modo elegido
export function getEffectivePrice(product: Product, mode: PriceMode, blueRate: number | null): number

// Etiqueta legible: "Pesos (ARS)" | "Dólares (USD)" | "USD → ARS (Blue)"
export function priceModeLabel(mode: PriceMode): string

// Símbolo: "$" o "US$"
export function priceModeCurrency(mode: PriceMode): string
```

**Nuevo estado:**
- `priceMode: PriceMode` (default: `'ars'`)
- `setPriceMode(mode)` — cambia el modo activo

**Lógica de `getEffectivePrice`:**
```typescript
if (mode === 'usd' && product.price_sale_usd) return product.price_sale_usd
if (mode === 'usd_to_ars' && product.price_sale_usd && blueRate) return product.price_sale_usd * blueRate
return product.price_sale // fallback siempre a ARS manual
```

### POS (`src/renderer/pages/POS.tsx`) ✏️ MODIFICADO

**Cambios:**
- 3 botones toggle: `$ Pesos` (azul), `US$ Dólar` (verde), `USD→ARS` (púrpura)
- Banner informativo cuando está en modo `usd` o `usd_to_ars` mostrando cotización actual
- Precios de productos en la grilla se muestran en la moneda del modo activo
- Colores de precio: azul (ARS), verde (USD), púrpura (conversión)
- Subtotal bajo cada producto muestra el precio original USD cuando corresponde
- Pasa `priceMode` al `CheckoutModal`

### CheckoutModal (`src/renderer/components/CheckoutModal.tsx`) ✏️ MODIFICADO

**Cambios:**
- Recibe prop `priceMode: PriceMode`
- `formatCurrency()` muestra `US$` cuando modo es `usd`
- PDF del ticket incluye: etiqueta del modo (`priceModeLabel`) y cotización blue cuando es `usd_to_ars`
- Cada item del ticket usa `getEffectivePrice` para calcular precio unitario
- Resumen del modal muestra moneda correcta

---

## 📱 3. Precios USD en App Móvil

### Scanner principal (`app/(app)/index.tsx`) ✏️ MODIFICADO

**Cambios:**
- Interfaz `Product` ahora incluye `price_sale_usd` y `price_cost_usd`
- Query a Supabase selecciona los campos USD
- Cotización blue se obtiene al montar el componente (mismas APIs que desktop)
- Modal de resultado de escaneo muestra **3 secciones de precios:**

| Sección | Color | Contenido |
|---|---|---|
| ARS | Blanco | Costo y Venta en pesos |
| USD | 🟢 Verde | Costo y Venta en USD crudo |
| USD→ARS | 🟣 Púrpura | Conversión automática con blue rate |

```typescript
// Obtener cotización blue al montar
useEffect(() => {
  const fetchBlue = async () => {
    try {
      const res = await fetch('https://dolarapi.com/v1/dolares/blue')
      const data = await res.json()
      if (data?.venta) setBlueRate(data.venta)
    } catch {
      // Fallback a bluelytics
      const res = await fetch('https://api.bluelytics.com.ar/v2/latest')
      const data = await res.json()
      if (data?.blue?.value_sell) setBlueRate(data.blue.value_sell)
    }
  }
  fetchBlue()
}, [])
```

---

## 🎨 4. Jerarquía Visual de Precios (Inversión)

### Problema
Inicialmente se mostraba el precio USD grande y la conversión ARS pequeña. Pero el usuario usa ARS como referencia diaria → la conversión debía ser prominente.

### Solución aplicada en 3 archivos

| Archivo | Antes | Después |
|---|---|---|
| `ProductCard.tsx` | USD grande, ARS chico | **Conversión ARS `text-lg font-bold`**, USD `text-[10px]` abajo |
| `ProductDetailModal.tsx` | USD grande, ARS chico | **Conversión ARS `text-xl font-bold`**, USD `text-xs` abajo |
| `ScannerPage.tsx` | USD grande, ARS chico | **Conversión ARS prominente**, USD `text-xs` abajo |

### Diseño final del ProductCard (sección púrpura)

```
┌─────────────────────────────────────────────┐
│          💲 Conversión Blue                 │
│                                             │
│     COSTO          │       VENTA            │
│   $147,200         │     $184,000           │
│  US$ 128.00        │    US$ 160.00          │
└─────────────────────────────────────────────┘
```

- Fondo `bg-purple-50`, borde `border-purple-200`
- Layout centrado con `flex items-center justify-center gap-6`
- Divider vertical entre costo y venta (`w-px h-8 bg-purple-200`)
- Labels en `text-[11px] uppercase tracking-wide text-purple-400`
- Precio conversión: `text-lg font-bold text-purple-700`
- Precio USD: `text-[10px] text-gray-400`

---

## 🗂️ 5. Sidebar Colapsable

### Dashboard (`src/renderer/pages/Dashboard.tsx`) ✏️ MODIFICADO

**Nuevo estado:**
```typescript
const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
```

**Comportamiento:**
- Botón con `ChevronLeft` / `ChevronRight` para toggle
- **Expandida (~256px):** Logo grande (56px), nombre del sistema, selector de sucursal, menú con textos, footer con nombre/rol del usuario, copyright
- **Colapsada (~72px):** Solo íconos centrados, logo pequeño (48px), badges como puntos, botón logout solo ícono

**Elementos afectados por el colapso:**
- Logo: `w-14 h-14` expandido → `w-12 h-12` colapsado
- Menú: texto visible → solo ícono
- Badge de escaneados: número completo → punto azul
- Selector de sucursal: dropdown → oculto
- Footer usuario: nombre + rol → solo botón logout
- Copyright: visible → oculto

---

## ⚙️ 6. Página de Configuración

### `src/renderer/pages/Settings.tsx` ✅ NUEVO (242 líneas)

**3 secciones:**

#### Sección 1: Empresa
- **Nombre editable** (solo `owner` / `admin`) con botón Guardar
- **Plan** (solo lectura): `free`, `pro`, etc.
- **Estado suscripción** (solo lectura): badge verde/amarillo
- **Límites** (solo lectura): máx. sucursales, productos/suc, usuarios/suc
- Mensaje informativo para roles sin permisos

#### Sección 2: Cotización Dólar Blue
- Cards con **Venta** (verde) y **Compra** (azul) del blue
- Botón **Actualizar** con ícono `RefreshCw` (animación spin)
- Fecha de última actualización
- Fuente: `dolarapi.com (fallback: bluelytics.com.ar)`

#### Sección 3: Mi Cuenta
- Nombre, Email, Rol (capitalizado), Estado (Activo/Inactivo)
- Todo solo lectura

**Integración:**
- Ruta `settings` agregada al router del `Dashboard`
- Ícono `Settings` (engranaje) en el menú de la sidebar
- Accesible para todos los roles

---

## 🐐 7. Branding: Logo + BG Gestión + Binary Goats

### Logo de la empresa

**Archivo:** `src/renderer/assets/logo.png` (imagen de cabra/goat)

**Uso en Desktop:**
| Ubicación | Tamaño | Estilo |
|---|---|---|
| Sidebar expandida | `w-14 h-14` (56px) | `rounded-full object-cover` |
| Sidebar colapsada | `w-12 h-12` (48px) | `rounded-full object-cover` |
| Login | `w-24 h-24` (96px) | `rounded-full object-cover shadow-lg` |

**Uso en App Móvil:**
| Ubicación | Tamaño | Estilo |
|---|---|---|
| Login | `96×96` | `borderRadius: 48` |

**Declaración de tipos:**
```typescript
// src/renderer/global.d.ts
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.jpg' { ... }
declare module '*.svg' { ... }
```

### Nombre del sistema: "BG Gestión"

| Archivo | Cambio |
|---|---|
| `index.html` | `<title>BG Gestión</title>` |
| `Login.tsx` (desktop) | `<h1>BG Gestión</h1>` debajo del logo |
| `login.tsx` (mobile) | `<Text style={styles.title}>BG Gestión</Text>` debajo del logo |

### Copyright: Binary Goats

| Archivo | Ubicación | Estilo |
|---|---|---|
| `Login.tsx` (desktop) | Debajo de "Versión 1.0.0" | `text-xs text-gray-400` |
| `Dashboard.tsx` (sidebar) | Debajo botón logout (solo expandida) | `text-[10px] text-gray-400 text-center` |
| `login.tsx` (mobile) | Debajo del formulario | `fontSize: 11, color: rgba(255,255,255,0.5)` |
| `profile.tsx` (mobile) | Debajo de "BG Gestión Scanner v1.0.0" | `fontSize: 11, color: #d1d5db` |

**Texto:**
```
© 2026 Binary Goats. Todos los derechos reservados.
```

### Logo en App Móvil
- Reemplazó el emoji 📦 por `require('../../assets/logo.png')` en el login
- `Image` con `width: 96, height: 96, borderRadius: 48`

---

## 🔐 8. Mantener Sesión Iniciada (App Móvil)

### Problema
Al cerrar y reabrir la app, el usuario debía loguearse de nuevo cada vez aunque Supabase ya persistía la sesión con `SecureStore`.

### Solución
Se agregó un toggle "Mantener sesión iniciada" (activado por defecto) que controla si la sesión se restaura o se cierra al reabrir.

### Login (`app/(auth)/login.tsx`) ✏️ MODIFICADO

**Cambios:**
- Import de `Switch` desde React Native
- Estado `keepSession` (default: `true`)
- Se pasa como tercer argumento a `login(email, password, keepSession)`
- UI: `Switch` con `trackColor` azul + texto "Mantener sesión iniciada" encima del botón

### Auth Store (`store/auth.ts`) ✏️ MODIFICADO

**Cambios:**
- Import de `expo-secure-store`
- Constante `KEEP_SESSION_KEY = 'bg_keep_session'`
- Firma de `login` actualizada: `login(email, password, keepSession?: boolean)`

**Flujo login:**
```typescript
login: async (email, password, keepSession = false) => {
  // ... autenticación normal ...
  await SecureStore.setItemAsync(KEEP_SESSION_KEY, keepSession ? 'true' : 'false')
  // ... cargar usuario y sucursales ...
}
```

**Flujo checkAuth (al abrir la app):**
```typescript
checkAuth: async () => {
  const keepSession = await SecureStore.getItemAsync(KEEP_SESSION_KEY)
  if (keepSession === 'false') {
    // No quiso mantener sesión → cerrar y mostrar login
    await SecureStore.deleteItemAsync(KEEP_SESSION_KEY)
    await supabase.auth.signOut()
    set({ isLoading: false, isAuthenticated: false })
    return
  }
  // keepSession === 'true' o null (primera vez) → restaurar normalmente
  const { data: { session } } = await supabase.auth.getSession()
  // ... continuar restauración ...
}
```

**Flujo logout:**
```typescript
logout: async () => {
  await SecureStore.deleteItemAsync(KEEP_SESSION_KEY)
  await supabase.auth.signOut()
  // ... limpiar estado ...
}
```

---

## 📁 Resumen de Archivos

### Archivos Nuevos

| Archivo | Descripción |
|---|---|
| `src/renderer/store/dollar.ts` | Store cotización dólar blue (fetch, cache 5min, conversión) |
| `src/renderer/pages/Settings.tsx` | Página de configuración (empresa, dólar, cuenta) |
| `src/renderer/assets/logo.png` | Logo de Binary Goats (cabra) |

### Archivos Modificados — Desktop

| Archivo | Cambios principales |
|---|---|
| `store/products.ts` | Campos `price_cost_usd`, `price_sale_usd` en tipo, queries, create, update |
| `store/pos.ts` | `PriceMode`, `getEffectivePrice()`, `priceModeLabel()`, `priceModeCurrency()`, estado `priceMode` |
| `pages/Dashboard.tsx` | Sidebar colapsable, logo, copyright Binary Goats, ruta Settings, import SettingsPage |
| `pages/Login.tsx` | Logo imagen, "BG Gestión" h1, copyright Binary Goats |
| `pages/POS.tsx` | 3 botones de modo precio, banner cotización, precios coloreados por modo |
| `pages/ScannerPage.tsx` | Sección púrpura USD→ARS con jerarquía invertida |
| `pages/Products.tsx` | (sin cambios adicionales en esta sesión) |
| `components/ProductCard.tsx` | Sección púrpura centrada, conversión prominente, USD pequeño |
| `components/ProductDetailModal.tsx` | Sección púrpura, conversión `text-xl`, USD `text-xs` |
| `components/CreateProductModal.tsx` | Inputs USD (costo/venta) con preview conversión inline |
| `components/EditProductModal.tsx` | Inputs USD editables |
| `components/CheckoutModal.tsx` | Recibe `priceMode`, formatea moneda, ticket PDF con modo + blue rate |
| `global.d.ts` | Declaraciones `*.png`, `*.jpg`, `*.svg` |
| `index.html` | `<title>BG Gestión</title>` |

### Archivos Modificados — App Móvil

| Archivo | Cambios principales |
|---|---|
| `app/(auth)/login.tsx` | Logo imagen, copyright, Switch "Mantener sesión", pasa `keepSession` a login |
| `app/(app)/index.tsx` | Campos USD en interface/query, fetch blue rate, 3 secciones de precios |
| `app/(app)/profile.tsx` | Copyright Binary Goats debajo de versión |
| `store/auth.ts` | `SecureStore` para preferencia sesión, `login(keepSession)`, `checkAuth` verifica flag |

---

## 📊 Progreso General del Proyecto

### Módulos Completados:
- ✅ Autenticación y Autorización
- ✅ Organizaciones y Planes
- ✅ Sucursales
- ✅ Usuarios y Empleados
- ✅ Productos (CRUD completo)
- ✅ Categorías y Filtros
- ✅ Movimientos de Inventario
- ✅ Catálogo Maestro
- ✅ Reportes y Estadísticas
- ✅ Punto de Venta (POS)
- ✅ Historial de Ventas con PDF
- ✅ Sistema de Escaneo Inalámbrico (PC + App)
- ✅ **Precios en Dólares (USD) + Conversión Blue** ← NUEVO
- ✅ **POS con 3 modos de precio** ← NUEVO
- ✅ **Página de Configuración** ← NUEVO
- ✅ **Sidebar colapsable** ← NUEVO
- ✅ **Branding completo (BG Gestión + Binary Goats)** ← NUEVO
- ✅ **Mantener sesión (App Móvil)** ← NUEVO

### Pendiente:
- ⏳ Sistema de Clientes
- ⏳ Sistema de Proveedores
- ⏳ Permisos granulares avanzados

### Estadísticas:
- **Archivos creados en esta sesión:** 3
- **Archivos modificados en esta sesión:** 18 (14 desktop + 4 móvil)
- **Stores nuevos:** 1 (`dollar.ts`)
- **Páginas nuevas:** 1 (`Settings.tsx`)
- **Total archivos del proyecto:** 50+
- **Tablas en DB:** 13

---

## 🧠 Aprendizajes de la Sesión

1. **Doble API para dólar blue** — dolarapi.com como primaria y bluelytics como fallback garantiza alta disponibilidad
2. **Cache de 5 minutos** — evita requests innecesarios sin mostrar datos desactualizados
3. **Jerarquía visual importa** — el precio que el usuario consulta diariamente (conversión ARS) debe ser prominente, no el valor crudo en USD
4. **`SecureStore` para preferencias sensibles** — la opción de mantener sesión se guarda de forma segura en el dispositivo
5. **`declare module '*.png'`** — necesario en TypeScript para importar assets estáticos como módulos
6. **3 modos de precio son suficientes** — "pesos manual", "dólar puro" y "conversión" cubren todos los casos de uso de un negocio argentino
7. **`getEffectivePrice()` centralizado** — una sola función decide el precio según el modo, evitando lógica duplicada en POS, CheckoutModal y tickets

# 📋 Documentación de Progreso - Sesión 6
## 📅 Fecha: 16 de Febrero, 2026

> **⚠️ DEPRECADO (5 de marzo de 2026):** Todo el sistema de escaneo móvil descrito en esta sesión fue reemplazado por un escáner físico ProSoft S224. La app móvil, Supabase Realtime y la tabla `scanned_items` ya no se usan.

> **Punto de partida:** PROGRESO-5.md  
> Al inicio de esta sesión el sistema contaba con: Auth, Sucursales, Usuarios, Productos, Categorías, Movimientos, Catálogo Maestro, Reportes, POS e Historial de Ventas.

---

## 🎯 Objetivo de la Sesión (DEPRECADO)
~~Diseñar e implementar el **Sistema de Escaneo Inalámbrico** — permite usar un celular Android como escáner de códigos de barras que se comunica en tiempo real con el programa de escritorio (PC) a través de Supabase Realtime.~~

---

## 🏗️ Decisiones de Arquitectura

### Opciones Evaluadas

| Opción | Pros | Contras | Decisión |
|---|---|---|---|
| WebSocket local (WiFi) | Muy rápido ~20ms | Requiere misma red, IPs cambian, config compleja | ❌ Descartado |
| Supabase Realtime | Funciona en cualquier red, sin config, ya integrado | ~300ms latencia | ✅ Elegido |
| QR + PWA | Sin instalación | Menos robusto, sin acceso a cámara nativa | ❌ Descartado |

### Arquitectura Final

```
App Android (celular)
        ↓
Escanea código de barras con cámara
        ↓
INSERT en scanned_items (Supabase)
        ↓
Supabase Realtime notifica a la PC (~300ms)
        ↓
PC busca el producto en memoria local (sin query extra)
        ↓
Reacciona según la pantalla activa:
  → Pestaña Escaneados: muestra detalle del producto
  → POS: agrega al carrito automáticamente
  → Productos: abre formulario con código prellenado
```

### ¿Por qué Supabase Realtime no es costoso?

- 1 escaneo = 1 INSERT (registro pequeño: id, barcode, timestamp)
- Un negocio típico: 200 escaneos/día × 30 días = **6,000 requests/mes**
- Plan free de Supabase: **2,000,000 requests/mes**
- Los `scanned_items` se limpian automáticamente cada 24hs
- **Conclusión:** costo prácticamente nulo

---

## ⚙️ Configuración en Supabase

### 1. Verificación de tabla existente
```sql
SELECT * FROM scanned_items LIMIT 1;
-- Resultado: Success. No rows returned. (tabla ya existía)
```

### 2. Columnas de `scanned_items`
```
id                uuid          PRIMARY KEY
product_branch_id uuid          FK → products_branch
branch_id         uuid          FK → branches
scanned_at        timestamp     
scanned_by        uuid          FK → users
device_id         varchar       identificador del dispositivo
device_type       varchar       'desktop' | 'mobile'
is_viewed         boolean       DEFAULT false
created_at        timestamp     
barcode           varchar(50)   ← AGREGADA en esta sesión
```

### 3. Columna barcode agregada
```sql
ALTER TABLE scanned_items 
ADD COLUMN IF NOT EXISTS barcode varchar(50);
-- Resultado: Success
```

### 4. Realtime habilitado
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE scanned_items;
-- Resultado: Ya estaba habilitado desde antes
```

### 5. Limpieza automática cada 24hs
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'limpiar-scanned-items',
  '0 3 * * *',
  $$DELETE FROM scanned_items WHERE created_at < NOW() - INTERVAL '24 hours'$$
);
```

**Job creado:**
```json
{
  "jobid": 1,
  "schedule": "0 3 * * *",
  "command": "DELETE FROM scanned_items WHERE created_at < NOW() - INTERVAL '24 hours'",
  "jobname": "limpiar-scanned-items"
}
```
Se ejecuta todos los días a las 3am automáticamente.

---

## 💻 Sistema PC — Archivos Creados/Modificados

### 1. Store del Scanner (`src/renderer/store/scanner.ts`) ✅ NUEVO

**Responsabilidades:**
- Conectarse a Supabase Realtime al iniciar sesión
- Escuchar INSERTs en `scanned_items` filtrados por `branch_id`
- Enriquecer cada escaneo con datos del producto (nombre, precio, stock)
- Mantener el último escaneo y el historial del día en memoria
- Exponer contador de escaneos no vistos para el badge del menú

**Estado:**
```typescript
interface ScannerState {
  lastScan: ScannedItem | null      // último escaneo recibido
  history: ScannedItem[]            // historial del día (máx 50)
  isListening: boolean              // estado de conexión Realtime
  mode: 'idle' | 'waiting'         // modo actual
  unviewedCount: number             // badge del menú
}
```

**Flujo al recibir un escaneo:**
1. Llega el INSERT via Realtime
2. Busca el producto por `barcode` o `product_branch_id` en Supabase
3. Enriquece el objeto con nombre, precio, stock
4. Actualiza `lastScan`, `history` y `unviewedCount`
5. Los componentes suscritos se re-renderizan automáticamente

**Acciones disponibles:**
- `startListening()` — inicia el canal Realtime
- `stopListening()` — desconecta el canal
- `fetchHistory()` — carga historial inicial desde Supabase
- `markAsViewed(id)` — marca un escaneo como visto
- `clearHistory()` — borra todo el historial de la sucursal

---

### 2. Página Escaneados (`src/renderer/pages/ScannerPage.tsx`) ✅ NUEVO

**Layout:** dos paneles lado a lado.

**Panel izquierdo — Último escaneo:**
- Muestra el código de barras recibido
- Si el producto existe: nombre, precio de venta, precio de costo, stock actual
- Stock con código de color: verde (OK), amarillo (bajo), rojo (sin stock)
- Si el producto NO existe: aviso "Producto no encontrado" con el código
- Estado de conexión Realtime (verde/gris)

**Panel derecho — Historial del día:**
- Lista de todos los escaneos del día ordenados por hora
- Badge azul con cantidad de no vistos
- Cada item muestra: nombre del producto, código, hora, precio
- Punto azul = no visto, gris = visto
- Click en item → lo marca como visto
- Botón "Limpiar" para borrar todo el historial

---

### 3. Dashboard (`src/renderer/pages/Dashboard.tsx`) ✅ MODIFICADO

**Cambios:**
- Importa `useScannerStore` y llama a `startListening()` en `useEffect` al montar
- Llama a `stopListening()` al desmontar (cleanup)
- Agrega pestaña "Escaneados" al menú con ícono `Scan`
- Badge numérico en la pestaña cuando hay escaneos no vistos (ej: `3`)
- Widget "Último producto escaneado" en la home del dashboard

**Badge en menú:**
```typescript
{showBadge && (
  <span className="bg-blue-600 text-white text-xs px-1.5 py-0.5 rounded-full">
    {unviewedCount > 99 ? '99+' : unviewedCount}
  </span>
)}
```

---

### 4. POS (`src/renderer/pages/POS.tsx`) ✅ MODIFICADO

**Cambio principal:** Botón "Usar scanner app" que activa el modo de escucha.

**Modo scanner activo:**
- Botón verde pulsante "Escuchando app..."
- Banner verde: "Listo para recibir escaneos desde la app móvil..."
- Cuando llega un escaneo: busca el producto por barcode en la lista local
- Si existe → `addToCart(product, 1)` automáticamente
- Feedback verde: "✅ [Nombre] agregado al carrito"
- Feedback rojo: "❌ Producto con código [X] no encontrado"
- Feedback desaparece a los 3 segundos

**Lógica anti-duplicados:**
```typescript
// Evita procesar el mismo escaneo dos veces
if (lastScan.id === lastProcessedScanId) return
setLastProcessedScanId(lastScan.id)
```

**El modo manual (escribir código) sigue funcionando igual.**

---

### 5. Productos (`src/renderer/pages/Products.tsx`) ✅ MODIFICADO

**Cambio principal:** Botón "Agregar con scanner" en el header.

**Flujo cuando se activa:**
1. Banner verde: "Listo para escanear — Escaneá un producto desde la app móvil"
2. Espera el próximo escaneo de la app
3. Si el producto **ya existe** → abre `ProductDetailModal` con ese producto
4. Si el producto **no existe** → abre `CreateProductModal` con el código prellenado
5. El modo se desactiva automáticamente al recibir el escaneo

---

### 6. CreateProductModal (`src/renderer/components/CreateProductModal.tsx`) ✅ MODIFICADO

**Prop nueva:** `initialBarcode?: string`

**Cambios cuando recibe `initialBarcode`:**
- Campo barcode prellenado con el código escaneado
- Campo barcode es `readOnly` (no editable)
- Estilo verde en el campo: `bg-green-50 border-green-300 text-green-800`
- Badge en el header: "Código escaneado: [código]"
- Auto-focus en el campo "Nombre" (ya que barcode está listo)
- Texto de ayuda: "Código prellenado desde el scanner"

---

## 📁 Resumen de Archivos

| Archivo | Estado | Descripción |
|---|---|---|
| `src/renderer/store/scanner.ts` | ✅ Nuevo | Store Realtime, historial, unviewed count |
| `src/renderer/pages/ScannerPage.tsx` | ✅ Nuevo | Pestaña Escaneados con último scan e historial |
| `src/renderer/pages/Dashboard.tsx` | ✏️ Modificado | Badge menú + listener + widget último scan |
| `src/renderer/pages/POS.tsx` | ✏️ Modificado | Botón "Usar scanner app" + agrega al carrito |
| `src/renderer/pages/Products.tsx` | ✏️ Modificado | Botón "Agregar con scanner" + prellenar form |
| `src/renderer/components/CreateProductModal.tsx` | ✏️ Modificado | Prop `initialBarcode` + campo readonly + estilo |

---

## 🔄 Flujos Completos

### Flujo A: Ver detalle de producto escaneado
```
1. Empleado abre pestaña "Escaneados" en la PC
2. Abre la app Android y escanea un producto
3. En ~300ms aparece en el panel izquierdo:
   - Código de barras
   - Nombre del producto
   - Precio de venta y costo
   - Stock actual (con color según nivel)
4. En el panel derecho se agrega al historial
5. Badge del menú se incrementa
```

### Flujo B: Agregar producto al carrito desde POS
```
1. Cajero abre el POS
2. Presiona "Usar scanner app"
3. Empleado escanea producto con el celular
4. En ~300ms el producto aparece en el carrito
5. Mensaje "✅ [Nombre] agregado al carrito"
6. Se puede seguir escaneando sin hacer nada más
```

### Flujo C: Crear producto nuevo con scanner
```
1. Empleado va a Productos
2. Presiona "Agregar con scanner"
3. Banner verde: "Listo para escanear..."
4. Escanea el producto con el celular
5. Si no existe → CreateProductModal se abre con:
   - Campo barcode prellenado y bloqueado
   - Foco en el campo Nombre
   - Badge "Código escaneado: [código]"
6. Empleado completa nombre, precios y guarda
```

### Flujo D: Producto ya existe al intentar crear
```
1. Empleado va a Productos → "Agregar con scanner"
2. Escanea un producto que ya está en el sistema
3. Se abre directamente el ProductDetailModal
4. El empleado puede editarlo o registrar movimiento
```

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
- ✅ **Sistema de Escaneo Inalámbrico (PC)** ← NUEVO

### Pendiente:
- ⏳ App Android (escáner)
- ⏳ Sistema de Clientes
- ⏳ Sistema de Proveedores

### Estadísticas:
- **Historias completadas:** ~55 / ~147 (37%)
- **Archivos creados:** 45+
- **Tablas en DB:** 13

---

## 🚀 Próximo Paso: App Android

La app Android es la contraparte del sistema de escaneo. Necesita:

1. **Pantalla de conexión** — login con credenciales de Supabase
2. **Pantalla principal** — botón grande "Escanear"
3. **Cámara con detector de códigos** — usando la librería de la plataforma
4. **Al escanear** — INSERT en `scanned_items` con barcode + branch_id + device_id
5. **Feedback visual** — confirmación de escaneo exitoso

**Stack recomendado:** React Native + Expo
- Mismo lenguaje que el resto del proyecto (TypeScript/React)
- `expo-barcode-scanner` o `expo-camera` para el escaneo
- `@supabase/supabase-js` para la inserción

---

## 🧠 Aprendizajes de la Sesión

1. **Supabase Realtime es suficiente** para este caso de uso — 300ms de latencia es imperceptible para escaneo de productos
2. **Una sola inserción por escaneo** es muy eficiente — la PC busca el producto en memoria local, sin queries extra
3. **pg_cron para limpieza automática** — evita acumular datos y no requiere lógica en el cliente
4. **`lastProcessedScanId`** — patrón para evitar que el mismo escaneo se procese dos veces si el componente re-renderiza
5. **Props vs store** — `initialBarcode` se pasa como prop porque es un dato puntual de apertura del modal, no estado global
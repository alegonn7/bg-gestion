# BG Gestión — Requisitos Mínimos

## Programa de Escritorio (Electron)

### Hardware Mínimo

| Componente | Mínimo | Recomendado |
|------------|--------|-------------|
| **Procesador** | Dual-core 1.6 GHz (x64) | Quad-core 2.0 GHz+ |
| **RAM** | 4 GB | 8 GB |
| **Disco** | 500 MB libres | 1 GB libres |
| **Pantalla** | 1280 x 720 | 1920 x 1080 |

### Sistema Operativo

| SO | Versión Mínima |
|----|---------------|
| **Windows** | Windows 10 (64-bit) |
| **macOS** | macOS 10.15 (Catalina) |
| **Linux** | Ubuntu 20.04 / Debian 10 / Fedora 32 (64-bit) |

### Red

| Requisito | Detalle |
|-----------|---------|
| **Conexión a Internet** | Obligatoria (el sistema es cloud-first) |
| **Ancho de banda mínimo** | 1 Mbps (subida y bajada) |
| **Puertos** | 443 (HTTPS) — no requiere puertos especiales |
| **Firewall** | Permitir conexiones a `*.supabase.co` y `dolarapi.com` |

> Sin conexión a Internet el programa no funciona. Toda la data vive en Supabase.

---

## App Móvil (Escáner)

### Hardware Mínimo

| Componente | Mínimo |
|------------|--------|
| **Cámara** | Trasera con autofocus |
| **RAM** | 2 GB |
| **Almacenamiento** | 100 MB libres |

### Sistema Operativo

| SO | Versión Mínima |
|----|---------------|
| **Android** | 6.0 (Marshmallow) / API 23 |
| **iOS** | 13.0 |

### Red

- Conexión a Internet obligatoria (WiFi o datos móviles)
- Mismo requisito de acceso a `*.supabase.co`

---

## Backend (Supabase)

### Plan Free (suficiente para empezar)

| Recurso | Límite |
|---------|--------|
| **Base de datos** | 500 MB |
| **Storage** | 1 GB |
| **Ancho de banda** | 2 GB/mes |
| **Conexiones** | 60 simultáneas |
| **Auth** | 50.000 MAU |
| **Realtime** | 200 conexiones simultáneas |

### Plan Pro (cuando escale — USD 25/mes)

| Recurso | Límite |
|---------|--------|
| **Base de datos** | 8 GB (expandible) |
| **Storage** | 100 GB |
| **Ancho de banda** | 250 GB/mes |
| **Conexiones** | Sin límite práctico |

### Configuración Necesaria en Supabase

| Servicio | Configuración |
|----------|--------------|
| **Auth** | Email/Password habilitado |
| **Storage** | Bucket `organization-logos` (público) |
| **Realtime** | Habilitado en tabla `scanned_items` |
| **RLS** | Políticas activas en todas las tablas |

---

## Desarrollo / Build

### Para compilar el proyecto

| Herramienta | Versión Mínima |
|-------------|---------------|
| **Node.js** | 18.x LTS |
| **npm** | 9.x |
| **Git** | 2.x |

### Variables de Entorno Requeridas

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
VITE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

### Comandos

```bash
npm install          # Instalar dependencias
npm run dev          # Desarrollo (Vite + Electron)
npm run build        # Build de producción
npm run dist         # Generar instalador (.exe / .dmg)
```

---

## Resumen de Dependencias Críticas

| Dependencia | Uso | Sin ella... |
|-------------|-----|-------------|
| **Internet** | Toda la operación | No funciona nada |
| **Supabase** | Auth, DB, Realtime, Storage | No funciona nada |
| **dolarapi.com** | Cotización blue | POS funciona, pero sin conversión USD→ARS |
| **Webcam** | Escaneo desktop | Se puede buscar por nombre/código manualmente |
| **App móvil** | Escaneo rápido | Se puede operar 100% desde desktop |

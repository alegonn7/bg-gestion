# Arquitectura SaaS Multi-Tenant - Sistema de Gestión de Inventario

## Visión General del Sistema

Sistema SaaS multi-tenant que permite a múltiples negocios (organizaciones) gestionar su inventario con soporte para múltiples sucursales, empleados con roles, y límites basados en planes de suscripción.

## Modelo de Negocio

### Jerarquía de Entidades

```
SUPER ADMIN (Vos)
│
├── ORGANIZACIÓN 1 (Negocio/Cliente)
│   ├── Plan: Basic ($X/mes × sucursales)
│   ├── Catálogo Maestro (productos compartidos)
│   ├── SUCURSAL 1
│   │   ├── Stock de productos maestros
│   │   ├── Productos propios
│   │   └── Empleados (con roles)
│   └── SUCURSAL 2
│       ├── Stock de productos maestros
│       ├── Productos propios
│       └── Empleados (con roles)
│
├── ORGANIZACIÓN 2 (Negocio/Cliente)
│   ├── Plan: Free
│   └── SUCURSAL Única
│       └── ...
│
└── ORGANIZACIÓN 3 (Negocio/Cliente)
    └── ...
```

### Planes y Límites

| Plan | Precio | Sucursales | Productos | Usuarios | Soporte |
|------|--------|------------|-----------|----------|---------|
| **Free** | Gratis | 1 | 100 total | 2 | Email |
| **Basic** | $X/sucursal/mes | Hasta 3 | 1,000/sucursal | 10/sucursal | Email |
| **Pro** | $Y/sucursal/mes | Ilimitadas | Ilimitados | Ilimitados | Prioritario |
| **Enterprise** | Custom | Ilimitadas | Ilimitados | Ilimitados | 24/7 + Dedicado |

**Cálculo de precio:**
- Negocio con Plan Basic y 3 sucursales = $X × 3 = $3X/mes
- Negocio con Plan Pro y 10 sucursales = $Y × 10 = $10Y/mes

### Estados de Suscripción

```javascript
subscription_status:
- "active"     → Todo funciona normal
- "suspended"  → No pagó → Modo solo lectura
- "cancelled"  → Cancelado → Sin acceso
- "trial"      → Prueba gratuita (7-30 días)
```

**Cuando no paga:**
- Al instante pasa a `suspended`
- Solo pueden ver datos (modo lectura)
- No pueden crear/editar/eliminar
- Banner: "Tu suscripción está suspendida. Contacta al administrador."

---

## Arquitectura Técnica

### Stack Tecnológico

#### Programa de Escritorio (Electron)
- **Framework**: Electron v28+
- **Frontend**: React 18 + TypeScript + Vite
- **UI**: Tailwind CSS + shadcn/ui
- **Estado**: Zustand
- **Base de datos local**: SQLite (better-sqlite3)
- **Sincronización**: Supabase Realtime + custom sync logic
- **Auth**: Supabase Auth (JWT)
- **Empaquetado**: electron-builder

#### App Móvil (React Native)
- **Framework**: React Native + Expo
- **UI**: React Native Paper
- **Base de datos local**: SQLite (expo-sqlite)
- **Sincronización**: Supabase Realtime
- **Auth**: Supabase Auth
- **Escáner**: expo-barcode-scanner

#### Backend (Supabase)
- **Base de datos**: PostgreSQL
- **Autenticación**: Supabase Auth
- **Realtime**: Supabase Realtime (WebSockets)
- **Storage**: Supabase Storage (imágenes - futuro)
- **Row Level Security**: Políticas de acceso por organización/sucursal

#### Panel Admin (Next.js - Futuro)
- **Framework**: Next.js 14+ (App Router)
- **UI**: Tailwind CSS + shadcn/ui
- **Deploy**: Vercel
- **Funcionalidades**:
  - Ver todos los negocios
  - Activar/desactivar organizaciones
  - Cambiar planes
  - Ver estadísticas de uso
  - Gestionar límites

---

## Modelo de Datos (PostgreSQL)

### Tablas Principales

#### 1. organizations (Negocios/Clientes)
```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL, -- para URLs
  plan VARCHAR(50) NOT NULL DEFAULT 'free', -- free, basic, pro, enterprise
  subscription_status VARCHAR(50) DEFAULT 'active', -- active, suspended, cancelled, trial
  trial_ends_at TIMESTAMP,
  subscription_started_at TIMESTAMP,
  subscription_ends_at TIMESTAMP,
  max_branches INTEGER DEFAULT 1, -- límite según plan
  max_products_per_branch INTEGER DEFAULT 100,
  max_users_per_branch INTEGER DEFAULT 2,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB -- info adicional (contacto, dirección, etc.)
);
```

#### 2. branches (Sucursales)
```sql
CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  address TEXT,
  phone VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Índices
  UNIQUE(organization_id, name)
);

-- Índice para búsquedas rápidas
CREATE INDEX idx_branches_org ON branches(organization_id);
```

#### 3. users (Empleados)
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(200),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL, -- NULL = acceso a todas
  role VARCHAR(50) NOT NULL, -- owner, admin, manager, employee
  
  -- Permisos específicos (opcional, para control granular)
  permissions JSONB DEFAULT '{}', 
  -- Ejemplo: {"can_delete_products": false, "can_edit_prices": true}
  
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Auth (sincronizado con Supabase Auth)
  auth_id UUID UNIQUE -- referencia a auth.users de Supabase
);

-- Índices
CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_branch ON users(branch_id);
CREATE INDEX idx_users_email ON users(email);
```

**Roles:**
- `owner`: Dueño del negocio, ve todo, puede crear sucursales
- `admin`: Administrador general, ve todo, no puede crear sucursales
- `manager`: Administrador de una sucursal específica
- `employee`: Solo puede escanear, ver productos, registrar movimientos

#### 4. products_master (Catálogo Maestro)
```sql
CREATE TABLE products_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  barcode VARCHAR(50),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  base_price_cost DECIMAL(12,2),
  base_price_sale DECIMAL(12,2),
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  version INTEGER DEFAULT 1, -- para control de conflictos
  
  -- Índices
  UNIQUE(organization_id, barcode) -- código único por organización
);

-- Índices
CREATE INDEX idx_products_master_org ON products_master(organization_id);
CREATE INDEX idx_products_master_barcode ON products_master(barcode);
CREATE INDEX idx_products_master_name ON products_master(name);
```

#### 5. products_branch (Productos + Stock por Sucursal)
```sql
CREATE TABLE products_branch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  product_master_id UUID REFERENCES products_master(id) ON DELETE CASCADE, -- NULL si es producto propio
  
  -- Si es producto propio de la sucursal (no del catálogo maestro)
  barcode VARCHAR(50),
  name VARCHAR(200),
  description TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  price_cost DECIMAL(12,2),
  price_sale DECIMAL(12,2),
  image_url TEXT,
  
  -- Stock específico de esta sucursal
  stock_quantity INTEGER DEFAULT 0,
  stock_min INTEGER DEFAULT 0,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),
  version INTEGER DEFAULT 1,
  
  -- Constraint: o es del maestro o tiene sus propios datos
  CHECK (
    (product_master_id IS NOT NULL AND name IS NULL) OR 
    (product_master_id IS NULL AND name IS NOT NULL)
  )
);

-- Índices
CREATE INDEX idx_products_branch_branch ON products_branch(branch_id);
CREATE INDEX idx_products_branch_master ON products_branch(product_master_id);
CREATE UNIQUE INDEX idx_products_branch_barcode ON products_branch(branch_id, barcode) WHERE barcode IS NOT NULL;
```

**Lógica:**
- Si `product_master_id` IS NOT NULL → Es un producto del catálogo maestro, usa esos datos + stock local
- Si `product_master_id` IS NULL → Es un producto propio de la sucursal, usa sus propios campos

#### 6. scanned_items (Productos Escaneados)
```sql
CREATE TABLE scanned_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_branch_id UUID REFERENCES products_branch(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  scanned_at TIMESTAMP DEFAULT NOW(),
  scanned_by UUID REFERENCES users(id),
  device_id VARCHAR(100), -- identificador del dispositivo
  device_type VARCHAR(50), -- 'desktop', 'mobile'
  is_viewed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_scanned_branch ON scanned_items(branch_id);
CREATE INDEX idx_scanned_date ON scanned_items(scanned_at DESC);
```

#### 7. inventory_movements (Movimientos de Stock)
```sql
CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_branch_id UUID REFERENCES products_branch(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  movement_type VARCHAR(50) NOT NULL, -- 'entry', 'exit', 'adjustment'
  quantity INTEGER NOT NULL,
  stock_before INTEGER NOT NULL,
  stock_after INTEGER NOT NULL,
  reason VARCHAR(100), -- 'purchase', 'sale', 'damaged', 'return', etc.
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Índices
CREATE INDEX idx_movements_product ON inventory_movements(product_branch_id);
CREATE INDEX idx_movements_branch ON inventory_movements(branch_id);
CREATE INDEX idx_movements_date ON inventory_movements(created_at DESC);
```

#### 8. categories (Categorías)
```sql
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  color VARCHAR(7), -- hex color
  icon VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(organization_id, name)
);

-- Índices
CREATE INDEX idx_categories_org ON categories(organization_id);
CREATE INDEX idx_categories_parent ON categories(parent_id);
```

#### 9. sync_metadata (Control de Sincronización)
```sql
CREATE TABLE sync_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  device_id VARCHAR(100) NOT NULL,
  device_name VARCHAR(200),
  device_type VARCHAR(50), -- 'desktop-windows', 'desktop-mac', 'mobile-android', 'mobile-ios'
  last_sync_at TIMESTAMP DEFAULT NOW(),
  last_pull_at TIMESTAMP,
  last_push_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(user_id, device_id)
);
```

#### 10. conflict_logs (Registro de Conflictos)
```sql
CREATE TABLE conflict_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL, -- 'product', 'movement', etc.
  entity_id UUID NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  conflict_type VARCHAR(50), -- 'concurrent_edit', 'version_mismatch'
  version_local INTEGER,
  version_remote INTEGER,
  data_local JSONB,
  data_remote JSONB,
  resolved_at TIMESTAMP,
  resolution VARCHAR(50), -- 'local_wins', 'remote_wins', 'merged', 'manual'
  resolved_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### 11. audit_logs (Auditoría - Opcional)
```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  entity_type VARCHAR(50), -- 'product', 'user', 'branch', etc.
  entity_id UUID,
  action VARCHAR(50), -- 'create', 'update', 'delete'
  changes JSONB, -- before/after
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_org ON audit_logs(organization_id);
CREATE INDEX idx_audit_date ON audit_logs(created_at DESC);
```

---

## Row Level Security (RLS) - Supabase

### Políticas de Acceso

```sql
-- ORGANIZATIONS: Solo super admin ve todas
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own organization"
ON organizations FOR SELECT
USING (
  id IN (
    SELECT organization_id FROM users WHERE auth_id = auth.uid()
  )
);

-- BRANCHES: Solo usuarios de la organización
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view branches in their organization"
ON branches FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM users WHERE auth_id = auth.uid()
  )
);

-- Managers solo ven su sucursal
CREATE POLICY "Managers can only view their branch"
ON branches FOR SELECT
USING (
  id IN (
    SELECT branch_id FROM users 
    WHERE auth_id = auth.uid() AND role = 'manager'
  )
);

-- PRODUCTS_MASTER: Solo de tu organización
ALTER TABLE products_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view products in their organization"
ON products_master FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM users WHERE auth_id = auth.uid()
  )
);

-- PRODUCTS_BRANCH: Solo de tu sucursal (si eres manager) o todas (si eres owner/admin)
ALTER TABLE products_branch ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view products in their branches"
ON products_branch FOR SELECT
USING (
  branch_id IN (
    SELECT b.id FROM branches b
    JOIN users u ON u.organization_id = b.organization_id
    WHERE u.auth_id = auth.uid()
    AND (u.branch_id IS NULL OR u.branch_id = b.id)
  )
);

-- Similar para otras tablas...
```

---

## Flujo de Autenticación

### 1. Registro de Nueva Organización

```
Usuario va a landing page → "Crear cuenta"
↓
Formulario:
- Nombre del negocio
- Email
- Password
- Nombre completo
↓
Backend (Supabase Edge Function):
1. Crear usuario en auth.users
2. Crear organization (plan: 'trial')
3. Crear primera branch (default)
4. Crear user en tabla users (role: 'owner')
5. Enviar email de bienvenida
↓
Usuario puede descargar programa/app
```

### 2. Login en Programa de Escritorio

```
Usuario abre programa
↓
Pantalla de Login:
- Email
- Password
- [Botón: Iniciar sesión]
↓
Supabase Auth:
- Valida credenciales
- Retorna JWT token
- Retorna user_id
↓
Backend query:
SELECT u.*, o.*, o.subscription_status, o.plan
FROM users u
JOIN organizations o ON u.organization_id = o.id
WHERE u.auth_id = '{jwt.sub}'
↓
Si subscription_status = 'suspended':
  → Mostrar mensaje y modo solo lectura
Si subscription_status = 'active':
  → Cargar datos y permitir uso normal
↓
Sincronización inicial:
- Pull de productos_master de la org
- Pull de branches (según rol)
- Pull de products_branch de sucursales permitidas
- Iniciar WebSocket para realtime
```

### 3. Invitar Empleado

```
Owner/Admin va a "Configuración → Usuarios"
↓
"Invitar empleado":
- Email
- Nombre completo
- Sucursal asignada
- Rol (manager/employee)
↓
Backend:
1. Validar límite de usuarios según plan
2. Generar código de invitación (6 dígitos)
3. Crear registro en users (is_active: false)
4. Enviar email con código
↓
Empleado:
1. Descarga programa
2. En login, click "Tengo un código de invitación"
3. Ingresa email + código
4. Crea su password
5. Backend activa el usuario
6. Login normal
```

---

## Límites y Validaciones

### Validaciones en Backend (Supabase Functions o Database Triggers)

#### Al crear sucursal:
```sql
CREATE OR REPLACE FUNCTION check_branch_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
  max_allowed INTEGER;
BEGIN
  SELECT COUNT(*), o.max_branches
  INTO current_count, max_allowed
  FROM branches b
  JOIN organizations o ON b.organization_id = o.id
  WHERE b.organization_id = NEW.organization_id
  AND b.is_active = true
  GROUP BY o.max_branches;
  
  IF current_count >= max_allowed THEN
    RAISE EXCEPTION 'Límite de sucursales alcanzado para este plan';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_branch_limit
BEFORE INSERT ON branches
FOR EACH ROW EXECUTE FUNCTION check_branch_limit();
```

#### Al crear producto:
```sql
CREATE OR REPLACE FUNCTION check_product_limit()
RETURNS TRIGGER AS $$
DECLARE
  current_count INTEGER;
  max_allowed INTEGER;
BEGIN
  SELECT COUNT(*), o.max_products_per_branch
  INTO current_count, max_allowed
  FROM products_branch pb
  JOIN branches b ON pb.branch_id = b.id
  JOIN organizations o ON b.organization_id = o.id
  WHERE pb.branch_id = NEW.branch_id
  AND pb.is_active = true
  GROUP BY o.max_products_per_branch;
  
  IF current_count >= max_allowed THEN
    RAISE EXCEPTION 'Límite de productos alcanzado para esta sucursal';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_product_limit
BEFORE INSERT ON products_branch
FOR EACH ROW EXECUTE FUNCTION check_product_limit();
```

#### Al invitar usuario:
```sql
-- Similar al anterior, validando max_users_per_branch
```

---

## Sincronización Offline-First

### Estrategia de Sync

```javascript
// Cada dispositivo mantiene:
{
  device_id: "uuid-unico",
  last_sync: "2025-02-14T10:30:00Z",
  pending_changes: [
    {id: 1, table: 'products_branch', action: 'update', data: {...}},
    {id: 2, table: 'inventory_movements', action: 'create', data: {...}}
  ]
}

// Al recuperar conexión:
1. Validar que subscription_status = 'active'
   - Si no, bloquear escritura
2. Push pending_changes (en orden)
3. Pull cambios remotos desde last_sync
4. Detectar conflictos (version mismatch)
5. Resolver o notificar usuario
6. Actualizar last_sync
```

### Manejo de Suspensión

```javascript
// Al detectar subscription_status = 'suspended':
1. Deshabilitar todos los botones de crear/editar/eliminar
2. Mostrar banner: "Tu suscripción está suspendida"
3. Permitir solo lectura
4. No sincronizar cambios locales
5. Poll cada 5 minutos para verificar si se reactivó
```

---

## Arquitectura de Producto Maestro + Sucursal

### Ejemplo Práctico

**Organización:** "Supermercados XYZ"

**Catálogo Maestro:**
```json
products_master:
[
  {
    "id": "prod-001",
    "organization_id": "org-xyz",
    "barcode": "7790001234567",
    "name": "Coca Cola 500ml",
    "base_price_cost": 80,
    "base_price_sale": 150
  }
]
```

**Sucursal Centro:**
```json
products_branch:
[
  {
    "id": "pb-001",
    "branch_id": "branch-centro",
    "product_master_id": "prod-001", // ← Referencia al maestro
    "price_cost": 80,  // Puede override si es necesario
    "price_sale": 150, // Puede override si es necesario
    "stock_quantity": 50,
    "stock_min": 10
  },
  {
    "id": "pb-002",
    "branch_id": "branch-centro",
    "product_master_id": null, // ← Producto propio
    "barcode": "7790009999999",
    "name": "Empanada de carne (hecha en local)",
    "price_cost": 30,
    "price_sale": 80,
    "stock_quantity": 20,
    "stock_min": 5
  }
]
```

**Sucursal Norte:**
```json
products_branch:
[
  {
    "id": "pb-003",
    "branch_id": "branch-norte",
    "product_master_id": "prod-001", // ← Mismo producto maestro
    "price_cost": 80,
    "price_sale": 160, // ← Precio diferente en esta sucursal
    "stock_quantity": 30,
    "stock_min": 5
  }
]
```

### Flujo de UI

**Vista del Owner (ve todo):**
```
Productos:
  [Catálogo Maestro] (10 productos)
  - Coca Cola 500ml
  - Pepsi 500ml
  - ...
  
Sucursales:
  Centro (Stock: 50 items)
  - Coca Cola: 50 unidades
  - Empanada: 20 unidades (producto propio)
  
  Norte (Stock: 30 items)
  - Coca Cola: 30 unidades
```

**Vista del Manager de Sucursal Centro:**
```
Productos:
  - Coca Cola: 50 unidades [del catálogo maestro]
  - Empanada: 20 unidades [producto propio]
  
[Botón: Agregar producto del catálogo maestro]
[Botón: Crear producto propio de esta sucursal]
```

---

## Panel de Super Admin (Next.js - Futuro)

### Funcionalidades Principales

**Dashboard:**
- Total de organizaciones activas
- Total de sucursales
- Total de usuarios
- Ingresos mensuales estimados (manual, no automático)
- Gráficos de crecimiento

**Gestión de Organizaciones:**
```
Lista de negocios:
┌─────────────────────────────────────────────────────────┐
│ Negocio          │ Plan   │ Sucursales │ Estado    │   │
├─────────────────────────────────────────────────────────┤
│ Supermercados XYZ│ Pro    │ 5          │ ✓ Activo  │ ⚙ │
│ Kiosco Don Pepe  │ Free   │ 1          │ ⚠ Trial   │ ⚙ │
│ Farmacia Central │ Basic  │ 2          │ ✗ Suspendido│ ⚙│
└─────────────────────────────────────────────────────────┘

Acciones por negocio:
- Ver detalles (sucursales, usuarios, productos count)
- Cambiar plan
- Activar/Suspender
- Extender trial
- Ver logs de auditoría
- Impersonar usuario (para soporte)
```

**Configuración de Planes:**
```
[Editar Plan: Basic]
- Precio por sucursal: $X
- Max sucursales: 3
- Max productos/sucursal: 1000
- Max usuarios/sucursal: 10
[Guardar]
```

**Estadísticas de Uso:**
- Organizaciones por plan
- Churn rate
- Sucursales promedio por negocio
- Productos promedio por sucursal

---

## Despliegue

### Programa de Escritorio (Electron)
```bash
# Build
npm run build:electron

# Output:
dist/
├── Sistema-Inventario-Setup-1.0.0.exe  (Windows)
├── Sistema-Inventario-1.0.0.dmg        (Mac)
└── Sistema-Inventario-1.0.0.AppImage   (Linux)
```

**Distribución:**
- Hosting de instaladores: AWS S3, Google Drive, o tu propio servidor
- Landing page con botones de descarga por SO
- Auto-updater (opcional): electron-updater

### App Móvil
```bash
# Build Android
eas build --platform android

# Build iOS (requiere cuenta Apple Developer)
eas build --platform ios
```

**Distribución:**
- Google Play Store (Android)
- App Store (iOS)
- O distribución directa de APK

### Panel Admin (Next.js)
```bash
# Deploy a Vercel
vercel --prod
```

**Variables de entorno:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx (server-side only)
```

---

## Roadmap de Desarrollo

### Fase 1: MVP (2-3 meses)
- [ ] Modelo de datos completo en Supabase
- [ ] Sistema de autenticación (login/registro)
- [ ] Programa Electron básico (CRUD productos, stock)
- [ ] App móvil básica (escaneo + visualización)
- [ ] Sincronización offline-first
- [ ] Roles básicos (owner, employee)
- [ ] Plan Free funcional

### Fase 2: Multi-tenant (1-2 meses)
- [ ] Soporte completo de sucursales
- [ ] Catálogo maestro + productos propios
- [ ] Sistema de invitaciones
- [ ] Límites por plan
- [ ] RLS y permisos granulares
- [ ] Resolución de conflictos

### Fase 3: Admin Panel (1 mes)
- [ ] Panel Next.js en Vercel
- [ ] Dashboard de super admin
- [ ] Gestión de organizaciones
- [ ] Activar/suspender negocios
- [ ] Cambio de planes manual
- [ ] Logs de auditoría

### Fase 4: Mejoras (continuo)
- [ ] Reportes avanzados
- [ ] Imágenes de productos
- [ ] Exportación a Excel/PDF
- [ ] Notificaciones push
- [ ] Integración con APIs externas (proveedores)
- [ ] Pagos automáticos (Stripe/MercadoPago - opcional)

---

## Estimación de Costos (Supabase)

**Plan Free:**
- 500 MB database
- 1 GB file storage
- 2 GB bandwidth
- 50K usuarios activos/mes
- **Suficiente para:** ~10-20 organizaciones pequeñas

**Plan Pro ($25/mes):**
- 8 GB database
- 100 GB file storage
- 250 GB bandwidth
- 100K usuarios activos/mes
- **Suficiente para:** 100+ organizaciones

**Cuando escalar:** Al llegar a ~50 organizaciones activas, considerar Plan Pro.

---

## Seguridad

### Mejores Prácticas

1. **Nunca exponer service_role_key** en el cliente
2. **Usar RLS en TODAS las tablas**
3. **Validar subscription_status en cada operación crítica**
4. **Encriptar datos sensibles** (opcional: precios, márgenes)
5. **Logs de auditoría** para acciones importantes
6. **Rate limiting** en Supabase Edge Functions
7. **HTTPS obligatorio** (automático con Supabase)
8. **JWT tokens con expiración corta** (1 hora) + refresh tokens

### Prevención de Abuso

```sql
-- Trigger para prevenir creación masiva
CREATE OR REPLACE FUNCTION prevent_spam()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    SELECT COUNT(*) FROM products_branch 
    WHERE branch_id = NEW.branch_id 
    AND created_at > NOW() - INTERVAL '1 minute'
  ) > 10 THEN
    RAISE EXCEPTION 'Demasiados productos creados en poco tiempo';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## Monitoreo

### Métricas Clave

**Supabase Dashboard:**
- Número de queries/día
- Latencia promedio
- Errores de RLS
- Uso de storage
- Conexiones activas

**Custom Tracking:**
- Organizaciones activas vs suspendidas
- Productos por organización (avg)
- Sincronizaciones exitosas vs fallidas
- Conflictos de sincronización (count)

**Alertas:**
- Email si una org excede su límite
- Email si muchos conflictos de sync
- Email si subscription_status cambia

---

## Preguntas Frecuentes (FAQ)

**Q: ¿Qué pasa si un empleado se va de la empresa?**
A: El owner puede desactivar su usuario desde Configuración. El empleado pierde acceso inmediato.

**Q: ¿Puede una persona trabajar en múltiples organizaciones?**
A: Sí, pero necesita emails diferentes. Un email = una organización (por simplicidad en v1).

**Q: ¿Los productos del catálogo maestro se pueden eliminar?**
A: Sí, pero si alguna sucursal tiene stock de ese producto, se sugiere "desactivar" en vez de eliminar.

**Q: ¿Qué pasa si una sucursal cierra?**
A: Se marca como `is_active = false`. Los datos históricos se conservan pero no se sincronizan más.

**Q: ¿Límite de dispositivos por usuario?**
A: Ilimitados. Un usuario puede tener el programa en su PC + laptop + celular.

---

**FIN DEL DOCUMENTO**

**Próximos pasos:**
1. Revisar y aprobar esta arquitectura
2. Crear proyecto en Supabase
3. Implementar modelo de datos (tablas + RLS)
4. Iniciar desarrollo del programa Electron (MVP)
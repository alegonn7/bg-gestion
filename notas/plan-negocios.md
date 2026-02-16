# Sistema de Gestión de Productos con Escáner

## ¿Qué es este sistema?

Un sistema integral de gestión de inventario que permite administrar productos utilizando códigos de barras de fábrica (EAN/UPC). El sistema está diseñado para funcionar tanto online como offline, con sincronización automática entre múltiples dispositivos.

## Componentes principales

### 1. Programa de Escritorio (Electron - Sistema Principal)
Programa descargable e instalable para Windows, Mac y Linux. Permite:
- Gestión completa de productos (alta, baja, modificación)
- Control de inventario y stock
- Gestión de precios y categorías
- Visualización de productos escaneados en tiempo real
- Resolución de conflictos de sincronización
- Reportes y estadísticas
- **Funciona 100% offline** con base de datos local SQLite
- Se instala como cualquier programa (.exe, .dmg, .AppImage)

### 2. Aplicación Móvil (Escáner)
Herramienta móvil multiplataforma (Android/iOS) optimizada para:
- Escaneo rápido de códigos de barras mediante cámara
- Consulta inmediata de información de productos
- Registro de productos escaneados
- Operación offline con sincronización posterior
- Creación rápida de productos nuevos

### 3. Sistema de Sincronización
Motor de sincronización bidireccional que:
- Mantiene datos consistentes entre dispositivos
- Funciona en tiempo real cuando hay conexión
- Almacena cambios localmente cuando no hay internet
- Detecta y resuelve conflictos de edición
- Garantiza integridad de datos

## Alcance del sistema

### Funcionalidades principales

**Gestión de Productos:**
- Alta de productos mediante escaneo o ingreso manual
- Asociación de códigos de barras a productos
- Edición de información (nombre, descripción, categoría)
- Eliminación lógica (no se borran, se marcan como inactivos)
- Búsqueda avanzada y filtros

**Control de Inventario:**
- Registro de cantidades en stock
- Ajustes de inventario (entradas/salidas)
- Alertas de stock mínimo
- Historial de movimientos

**Gestión de Precios:**
- Precio de costo
- Precio de venta
- Márgenes de ganancia
- Historial de cambios de precios

**Categorización:**
- Organización por categorías jerárquicas
- Múltiples etiquetas por producto
- Filtrado y búsqueda por categoría

**Productos Escaneados (Pestaña especial):**
- Lista en tiempo real de últimos productos escaneados
- Sincronización instantánea entre web y móvil
- Acciones rápidas sobre productos escaneados
- Limpieza de lista de escaneados

**Sincronización Offline:**
- Base de datos local en cada dispositivo
- Sincronización automática con Supabase
- Cola de cambios pendientes
- Detección de conflictos
- Interfaz de resolución de conflictos

## Objetivos del sistema

### Objetivos principales

1. **Eficiencia operativa**: Reducir el tiempo de registro y consulta de productos mediante escaneo de códigos de barras
2. **Accesibilidad**: Permitir gestión desde cualquier dispositivo y lugar
3. **Confiabilidad**: Funcionar sin dependencia absoluta de conexión a internet
4. **Escalabilidad**: Soportar crecimiento de productos y usuarios sin degradación
5. **Usabilidad**: Interfaz intuitiva que no requiera capacitación extensa

### Objetivos técnicos

1. **Arquitectura offline-first**: Diseño que prioriza funcionamiento local con sincronización en segundo plano
2. **Cero costos de hosting**: Utilizar servicios gratuitos (Supabase free tier) para la nube
3. **Multiplataforma**: Funcionar en web (PC/tablet) y móvil (Android/iOS)
4. **Tiempo real**: Cambios visibles inmediatamente en todos los dispositivos conectados
5. **Integridad de datos**: Garantizar consistencia mediante resolución inteligente de conflictos

## A quién está dirigido

- **Pequeños comercios**: Que necesitan controlar inventario sin sistemas costosos
- **Emprendedores**: Que manejan stock desde casa u oficina pequeña
- **Gestores de almacenes**: Que requieren movilidad en el escaneo
- **Equipos distribuidos**: Que trabajan desde diferentes ubicaciones
- **Usuarios con conectividad limitada**: Que no tienen internet estable

## Valor diferencial

1. **Gratuito en infraestructura**: No requiere pago mensual de servidores
2. **Offline-first**: Funciona sin internet, sincroniza cuando puede
3. **Códigos de fábrica**: Aprovecha códigos EAN/UPC existentes
4. **Resolución de conflictos**: Sistema inteligente que no pierde datos
5. **Simplicidad**: Fácil de usar, difícil de romper

## Limitaciones conocidas

- Dependencia de plan gratuito de Supabase (límites de almacenamiento y requests)
- Requiere dispositivo con cámara para escaneo
- Conflictos múltiples requieren intervención manual
- Sin soporte para múltiples sucursales (v1.0)
- Sin facturación integrada (v1.0)

## Roadmap futuro (fuera del alcance inicial)

- Integración con sistemas de facturación
- Soporte multi-sucursal
- Reportes avanzados y analytics
- Integración con proveedores
- Sistema de usuarios y permisos granulares
- Exportación masiva de datos
- API pública para integraciones
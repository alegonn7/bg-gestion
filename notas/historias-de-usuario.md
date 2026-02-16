# Historias de Usuario SaaS Multi-Tenant - Índice

## Módulo: Autenticación y Registro

1. HU-AUTH-001: Registrar nueva organización (negocio)
2. HU-AUTH-002: Login con email y password
3. HU-AUTH-003: Recuperar contraseña olvidada
4. HU-AUTH-004: Cerrar sesión
5. HU-AUTH-005: Ver información de mi sesión actual

## Módulo: Gestión de Organización (Owner/Admin)

6. HU-ORG-001: Ver información de mi organización
7. HU-ORG-002: Editar datos de la organización
8. HU-ORG-003: Ver plan actual y límites
9. HU-ORG-004: Ver uso actual (sucursales, productos, usuarios)
10. HU-ORG-005: Solicitar upgrade de plan

## Módulo: Gestión de Sucursales

11. HU-BRANCH-001: Crear nueva sucursal
12. HU-BRANCH-002: Editar información de sucursal
13. HU-BRANCH-003: Desactivar sucursal
14. HU-BRANCH-004: Ver lista de sucursales
15. HU-BRANCH-005: Ver detalle de una sucursal
16. HU-BRANCH-006: Recibir alerta al alcanzar límite de sucursales

## Módulo: Gestión de Usuarios (Empleados)

17. HU-USER-001: Invitar nuevo empleado
18. HU-USER-002: Empleado acepta invitación y crea cuenta
19. HU-USER-003: Editar información de empleado
20. HU-USER-004: Cambiar rol de empleado
21. HU-USER-005: Reasignar empleado a otra sucursal
22. HU-USER-006: Desactivar empleado
23. HU-USER-007: Ver lista de empleados
24. HU-USER-008: Ver actividad de un empleado
25. HU-USER-009: Recibir alerta al alcanzar límite de usuarios

## Módulo: Catálogo Maestro (Owner/Admin)

26. HU-MASTER-001: Crear producto en catálogo maestro
27. HU-MASTER-002: Editar producto del catálogo maestro
28. HU-MASTER-003: Desactivar producto del catálogo maestro
29. HU-MASTER-004: Ver lista de productos maestros
30. HU-MASTER-005: Buscar en catálogo maestro
31. HU-MASTER-006: Importar productos al catálogo maestro desde CSV
32. HU-MASTER-007: Exportar catálogo maestro a CSV

## Módulo: Productos de Sucursal

33. HU-PROD-001: Agregar producto del catálogo maestro a mi sucursal
34. HU-PROD-002: Crear producto propio de la sucursal
35. HU-PROD-003: Editar stock de producto en sucursal
36. HU-PROD-004: Editar precio de producto en sucursal (override del maestro)
37. HU-PROD-005: Ver productos de mi sucursal
38. HU-PROD-006: Buscar productos en mi sucursal
39. HU-PROD-007: Ver productos de todas las sucursales (Owner/Admin)
40. HU-PROD-008: Comparar stock entre sucursales (Owner/Admin)
41. HU-PROD-009: Recibir alerta al alcanzar límite de productos

## Módulo: Escaneo de Productos

42. HU-SCAN-001: Escanear código de barras desde app móvil
43. HU-SCAN-002: Ver producto escaneado inmediatamente
44. HU-SCAN-003: Escanear producto que no existe en catálogo maestro
45. HU-SCAN-004: Escanear producto del maestro no agregado a mi sucursal
46. HU-SCAN-005: Ver historial de productos escaneados en mi sucursal
47. HU-SCAN-006: Ver historial de escaneos de todas las sucursales (Owner/Admin)
48. HU-SCAN-007: Filtrar escaneos por sucursal, empleado, fecha
49. HU-SCAN-008: Escanear desde webcam en programa de escritorio

## Módulo: Inventario

50. HU-INV-001: Registrar entrada de stock
51. HU-INV-002: Registrar salida de stock
52. HU-INV-003: Ajustar stock manualmente
53. HU-INV-004: Ver historial de movimientos de un producto
54. HU-INV-005: Ver historial de movimientos de mi sucursal
55. HU-INV-006: Ver consolidado de movimientos de todas las sucursales (Owner/Admin)
56. HU-INV-007: Recibir alerta de stock bajo en mi sucursal
57. HU-INV-008: Ver productos con stock crítico por sucursal
58. HU-INV-009: Hacer inventario físico con escaneo masivo

## Módulo: Precios

59. HU-PRICE-001: Establecer precio base en catálogo maestro
60. HU-PRICE-002: Override de precio en sucursal específica
61. HU-PRICE-003: Ver margen de ganancia por producto
62. HU-PRICE-004: Actualizar precios masivamente en catálogo maestro
63. HU-PRICE-005: Sincronizar precios del maestro a sucursales
64. HU-PRICE-006: Ver historial de cambios de precio

## Módulo: Categorización

65. HU-CAT-001: Crear categoría (nivel organización)
66. HU-CAT-002: Editar categoría
67. HU-CAT-003: Eliminar categoría
68. HU-CAT-004: Asignar producto a categoría
69. HU-CAT-005: Crear subcategorías
70. HU-CAT-006: Filtrar productos por categoría

## Módulo: Sincronización

71. HU-SYNC-001: Trabajar sin conexión a internet
72. HU-SYNC-002: Sincronizar cambios automáticamente al recuperar conexión
73. HU-SYNC-003: Ver estado de sincronización en tiempo real
74. HU-SYNC-004: Forzar sincronización manual
75. HU-SYNC-005: Ver cambios pendientes de sincronizar
76. HU-SYNC-006: Recibir notificación de sincronización exitosa
77. HU-SYNC-007: Recibir alerta de error en sincronización
78. HU-SYNC-008: Ver cambios de otros dispositivos en tiempo real

## Módulo: Resolución de Conflictos

79. HU-CONFLICT-001: Detectar conflicto de edición concurrente
80. HU-CONFLICT-002: Ver detalles de ambas versiones en conflicto
81. HU-CONFLICT-003: Elegir mi versión en caso de conflicto
82. HU-CONFLICT-004: Elegir la otra versión en caso de conflicto
83. HU-CONFLICT-005: Combinar manualmente ambas versiones
84. HU-CONFLICT-006: Ver historial de conflictos resueltos

## Módulo: Permisos y Roles

85. HU-PERM-001: Owner ve y administra todo el negocio
86. HU-PERM-002: Admin general ve todo pero no puede crear sucursales
87. HU-PERM-003: Manager solo ve y administra su sucursal asignada
88. HU-PERM-004: Empleado solo puede escanear y registrar movimientos
89. HU-PERM-005: Validar permisos antes de cada acción
90. HU-PERM-006: Mostrar/ocultar funciones según rol

## Módulo: Dashboard y Reportes

91. HU-DASH-001: Ver resumen general de mi sucursal (Manager/Employee)
92. HU-DASH-002: Ver resumen consolidado de todas las sucursales (Owner/Admin)
93. HU-DASH-003: Ver productos más escaneados por sucursal
94. HU-DASH-004: Ver estadísticas de movimientos de stock
95. HU-DASH-005: Exportar listado de productos a CSV
96. HU-DASH-006: Ver valor total del inventario por sucursal
97. HU-DASH-007: Comparar performance entre sucursales

## Módulo: Límites de Plan

98. HU-LIMIT-001: Ver advertencia al acercarse a límite de sucursales
99. HU-LIMIT-002: Bloquear creación de sucursal al alcanzar límite
100. HU-LIMIT-003: Ver advertencia al acercarse a límite de productos
101. HU-LIMIT-004: Bloquear creación de producto al alcanzar límite
102. HU-LIMIT-005: Ver advertencia al acercarse a límite de usuarios
103. HU-LIMIT-006: Bloquear invitación de usuario al alcanzar límite
104. HU-LIMIT-007: Ver banner con llamado a acción para upgrade

## Módulo: Suspensión de Cuenta

105. HU-SUSP-001: Recibir notificación de cuenta suspendida al iniciar sesión
106. HU-SUSP-002: Modo solo lectura cuando cuenta está suspendida
107. HU-SUSP-003: Bloquear sincronización cuando cuenta está suspendida
108. HU-SUSP-004: Reactivación automática al pagar

## Módulo: Dispositivos

109. HU-DEV-001: Ver lista de mis dispositivos sincronizados
110. HU-DEV-002: Vincular nuevo dispositivo con código
111. HU-DEV-003: Desvincular dispositivo
112. HU-DEV-004: Identificar qué dispositivo hizo un cambio
113. HU-DEV-005: Ver última actividad de cada dispositivo

## Módulo: Configuración

114. HU-CONFIG-001: Configurar stock mínimo por defecto
115. HU-CONFIG-002: Configurar formato de visualización de precios
116. HU-CONFIG-003: Activar/desactivar notificaciones
117. HU-CONFIG-004: Configurar tiempo de retención de escaneos
118. HU-CONFIG-005: Ver información técnica del dispositivo
119. HU-CONFIG-006: Realizar backup manual de datos locales

## Módulo: Búsqueda y Filtros

120. HU-SEARCH-001: Buscar producto por nombre
121. HU-SEARCH-002: Buscar producto por código de barras
122. HU-SEARCH-003: Filtrar productos por categoría
123. HU-SEARCH-004: Filtrar productos por sucursal (Owner/Admin)
124. HU-SEARCH-005: Filtrar por rango de precio
125. HU-SEARCH-006: Filtrar por stock disponible
126. HU-SEARCH-007: Ordenar productos por diferentes criterios
127. HU-SEARCH-008: Guardar búsquedas/filtros favoritos

## Módulo: Auditoría (Owner/Admin)

128. HU-AUDIT-001: Ver log de acciones de usuarios
129. HU-AUDIT-002: Ver quién modificó un producto
130. HU-AUDIT-003: Ver historial de cambios de un producto
131. HU-AUDIT-004: Filtrar logs por usuario, acción, fecha
132. HU-AUDIT-005: Exportar logs de auditoría

## Módulo: Onboarding

133. HU-ONBOARD-001: Tutorial al usar el programa por primera vez
134. HU-ONBOARD-002: Wizard de configuración inicial (crear primera sucursal)
135. HU-ONBOARD-003: Importar productos iniciales desde CSV
136. HU-ONBOARD-004: Invitar primer empleado desde onboarding
137. HU-ONBOARD-005: Tour guiado según rol (Owner vs Employee)

## Módulo: Super Admin Panel (Futuro)

138. HU-SUPER-001: Ver dashboard con todas las organizaciones
139. HU-SUPER-002: Ver detalle de una organización
140. HU-SUPER-003: Activar organización
141. HU-SUPER-004: Suspender organización
142. HU-SUPER-005: Cambiar plan de una organización
143. HU-SUPER-006: Extender período de prueba
144. HU-SUPER-007: Ver estadísticas de uso del sistema
145. HU-SUPER-008: Ver logs de errores globales
146. HU-SUPER-009: Impersonar usuario para soporte
147. HU-SUPER-010: Configurar planes y límites

Total: 147 Historias de Usuario
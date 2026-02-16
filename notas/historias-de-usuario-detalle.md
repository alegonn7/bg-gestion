    # Historias de Usuario Detalladas

    ---

    ## Módulo: Gestión de Productos

    ### HU-001: Crear producto escaneando código de barras

    **Como** usuario de la aplicación móvil  
    **Quiero** escanear el código de barras de un producto y crear su registro automáticamente  
    **Para** ahorrar tiempo y evitar errores al dar de alta productos nuevos

    **Criterios de Aceptación:**

    1. **DADO** que estoy en la pantalla de inicio de la app móvil  
    **CUANDO** presiono el botón "Escanear Producto"  
    **ENTONCES** se activa la cámara del dispositivo con un marco guía para el código de barras

    2. **DADO** que la cámara está activa  
    **CUANDO** enfoco un código de barras válido (EAN-13, UPC-A, etc.)  
    **ENTONCES** el sistema detecta y lee el código automáticamente en menos de 2 segundos

    3. **DADO** que el código fue escaneado exitosamente y NO existe en el sistema  
    **CUANDO** la lectura se completa  
    **ENTONCES** se muestra un formulario pre-llenado con el código de barras y campos vacíos para completar (nombre, descripción, categoría, precios, stock inicial)

    4. **DADO** que estoy en el formulario de nuevo producto  
    **CUANDO** completo al menos el nombre del producto y presiono "Guardar"  
    **ENTONCES** el producto se crea localmente, se muestra confirmación visual y se agrega a la cola de sincronización

    5. **DADO** que el producto fue creado  
    **CUANDO** hay conexión a internet  
    **ENTONCES** el producto se sincroniza automáticamente a Supabase en menos de 5 segundos

    6. **DADO** que el código fue escaneado exitosamente y SÍ existe en el sistema  
    **CUANDO** la lectura se completa  
    **ENTONCES** se muestra la información del producto existente con opción de editarlo o registrar movimiento de stock

    **Notas Técnicas:**
    - Usar expo-barcode-scanner o react-native-camera
    - Validar formatos: EAN-13, UPC-A, Code-128
    - Vibraciones y sonido al escanear exitosamente
    - Caché del último código escaneado para re-intentos

    **Definición de Hecho:**
    - Código escrito y testeado
    - Funciona offline con sincronización posterior
    - Manejo de errores de cámara (permisos, hardware)
    - Feedback visual en cada paso
    - Funciona en Android y iOS

    ---

    ### HU-002: Crear producto manualmente sin código de barras

    **Como** usuario del sistema (programa de escritorio o móvil)  
    **Quiero** crear un producto ingresando la información manualmente  
    **Para** registrar productos que no tienen código de barras o cuando no puedo escanear

    **Criterios de Aceptación:**

    1. **DADO** que estoy en la sección de Productos  
    **CUANDO** presiono el botón "+ Nuevo Producto"  
    **ENTONCES** se abre un formulario con los siguientes campos:
    - Nombre* (obligatorio)
    - Código de barras (opcional, con validación de formato)
    - Descripción
    - Categoría (selección de lista)
    - Precio de costo
    - Precio de venta
    - Stock inicial
    - Stock mínimo

    2. **DADO** que estoy completando el formulario  
    **CUANDO** ingreso un código de barras  
    **ENTONCES** el sistema valida que sea un formato válido y que no exista otro producto con ese código

    3. **DADO** que el código de barras ingresado ya existe  
    **CUANDO** intento guardar  
    **ENTONCES** se muestra error "Este código de barras ya está asociado al producto [Nombre]" y no se permite guardar

    4. **DADO** que completé al menos el nombre  
    **CUANDO** presiono "Guardar"  
    **ENTONCES** el producto se crea con un ID único (UUID), timestamp de creación y se guarda localmente

    5. **DADO** que el producto se creó exitosamente  
    **CUANDO** retorno a la lista de productos  
    **ENTONCES** veo el nuevo producto en la primera posición con un indicador visual de "recién creado"

    6. **DADO** que dejé campos vacíos no obligatorios  
    **CUANDO** guardo el producto  
    **ENTONCES** los campos vacíos se guardan como NULL/0 según corresponda y puedo editarlos después

    **Validaciones:**
    - Nombre: máximo 200 caracteres
    - Descripción: máximo 1000 caracteres
    - Código de barras: solo números, 8-13 dígitos
    - Precios: números positivos, máximo 2 decimales
    - Stock: números enteros no negativos

    **Definición de Hecho:**
    - Formulario validado en cliente y servidor
    - Mensajes de error claros
    - Se puede crear producto sin código de barras
    - Funciona offline
    - Responsive en web y móvil

    ---

    ### HU-003: Editar información de un producto existente

    **Como** usuario del sistema  
    **Quiero** modificar la información de un producto ya registrado  
    **Para** corregir errores o actualizar datos que cambiaron

    **Criterios de Aceptación:**

    1. **DADO** que estoy viendo el detalle de un producto  
    **CUANDO** presiono el botón "Editar"  
    **ENTONCES** se abre el mismo producto en modo edición con todos los campos modificables excepto el ID

    2. **DADO** que estoy editando un producto  
    **CUANDO** modifico uno o más campos y presiono "Guardar"  
    **ENTONCES** los cambios se guardan localmente con timestamp de actualización y ID del dispositivo que modificó

    3. **DADO** que modifiqué un producto  
    **CUANDO** hay conexión a internet  
    **ENTONCES** los cambios se sincronizan automáticamente incrementando el número de versión del producto

    4. **DADO** que estoy editando el código de barras  
    **CUANDO** ingreso un código que ya existe en otro producto  
    **ENTONCES** se muestra error y no se permite guardar

    5. **DADO** que presiono "Cancelar" al editar  
    **CUANDO** confirmé la cancelación  
    **ENTONCES** no se guardan los cambios y vuelvo a la vista de detalle

    6. **DADO** que otro dispositivo modificó el mismo producto mientras yo editaba (offline)  
    **CUANDO** ambos sincronicen  
    **ENTONCES** se detecta el conflicto y se me notifica para resolverlo (ver HU-043)

    **Tracking de Cambios:**
    - Se registra: updated_at, updated_by (device_id), version
    - Se incrementa version en cada modificación
    - Se guarda en sync_queue si está offline

    **Definición de Hecho:**
    - Funciona offline con sync posterior
    - Validaciones iguales que crear producto
    - Detección de cambios (dirty checking)
    - Confirmación antes de cancelar si hay cambios
    - Optimistic UI updates

    ---

    ### HU-004: Eliminar (desactivar) un producto

    **Como** usuario del sistema  
    **Quiero** eliminar productos que ya no manejo  
    **Para** mantener el catálogo limpio y relevante

    **Criterios de Aceptación:**

    1. **DADO** que estoy viendo el detalle de un producto  
    **CUANDO** presiono el botón "Eliminar"  
    **ENTONCES** se muestra un diálogo de confirmación "¿Estás seguro de eliminar [Nombre]? Esta acción no se puede deshacer."

    2. **DADO** que confirmé la eliminación  
    **CUANDO** presiono "Sí, eliminar"  
    **ENTONCES** el producto NO se borra de la base de datos, sino que se marca como is_active = false

    3. **DADO** que un producto fue eliminado  
    **CUANDO** veo la lista de productos  
    **ENTONCES** el producto eliminado NO aparece en la lista por defecto

    4. **DADO** que quiero ver productos eliminados  
    **CUANDO** activo el filtro "Mostrar eliminados"  
    **ENTONCES** veo todos los productos incluyendo los marcados como inactivos, con un distintivo visual

    5. **DADO** que un producto eliminado tiene historial de movimientos o escaneos  
    **CUANDO** lo elimino  
    **ENTONCES** el historial se conserva pero el producto aparece como "Producto eliminado" en esos registros

    6. **DADO** que intenté eliminar un producto  
    **CUANDO** hay conexión a internet  
    **ENTONCES** el cambio se sincroniza y todos los dispositivos dejan de mostrar ese producto

    **Restauración:**
    7. **DADO** que filtré productos eliminados  
    **CUANDO** selecciono un producto inactivo y presiono "Restaurar"  
    **ENTONCES** se marca como is_active = true y vuelve a aparecer en las listas normales

    **Definición de Hecho:**
    - Eliminación lógica (soft delete)
    - Confirmación obligatoria
    - Sincronización de estado
    - Historial preservado
    - Opción de restaurar

    ---

    ### HU-005: Buscar productos por diferentes criterios

    **Como** usuario del sistema  
    **Quiero** buscar productos por nombre, código de barras o categoría  
    **Para** encontrar rápidamente un producto específico

    **Criterios de Aceptación:**

    1. **DADO** que estoy en la lista de productos  
    **CUANDO** escribo en el campo de búsqueda  
    **ENTONCES** la lista se filtra en tiempo real mostrando productos que coinciden en nombre, código de barras o descripción

    2. **DADO** que escribí una búsqueda  
    **CUANDO** la búsqueda tiene menos de 3 caracteres  
    **ENTONCES** muestra todos los productos (no filtra) con mensaje "Escribe al menos 3 caracteres"

    3. **DADO** que escribí una búsqueda válida  
    **CUANDO** hay resultados  
    **ENTONCES** se muestran destacando (highlight) las coincidencias en el texto

    4. **DADO** que escribí una búsqueda  
    **CUANDO** NO hay resultados  
    **ENTONCES** se muestra mensaje "No se encontraron productos. Intenta con otros términos o escanea un código de barras"

    5. **DADO** que tengo filtros aplicados (ej: categoría seleccionada)  
    **CUANDO** realizo una búsqueda  
    **ENTONCES** la búsqueda se aplica SOBRE los filtros existentes (búsqueda AND filtros)

    6. **DADO** que cerré y reabrí la aplicación  
    **CUANDO** vuelvo a la lista de productos  
    **ENTONCES** el campo de búsqueda está vacío (no se persiste)

    **Búsqueda Avanzada:**
    7. **DADO** que presiono "Búsqueda avanzada"  
    **CUANDO** se abre el panel  
    **ENTONCES** puedo combinar: rango de precio, rango de stock, categoría, estado (activo/inactivo)

    **Performance:**
    - Búsqueda debe responder en menos de 300ms
    - Debounce de 300ms al escribir
    - Búsqueda case-insensitive
    - Búsqueda en base local (no requiere internet)

    **Definición de Hecho:**
    - Búsqueda en múltiples campos
    - Highlighting de coincidencias
    - Funciona offline
    - Performance óptima con 10,000+ productos
    - Keyboard shortcuts (web): Ctrl+K para enfocar búsqueda

    ---

    ### HU-006: Ver detalle completo de un producto

    **Como** usuario del sistema  
    **Quiero** ver toda la información de un producto en una pantalla dedicada  
    **Para** consultar o verificar datos completos

    **Criterios de Aceptación:**

    1. **DADO** que estoy en la lista de productos  
    **CUANDO** hago clic/tap en un producto  
    **ENTONCES** navego a la pantalla de detalle mostrando:
    - Nombre (destacado)
    - Código de barras (con opción de copiar)
    - Descripción
    - Categoría
    - Precio de costo
    - Precio de venta
    - Margen de ganancia (calculado: (venta-costo)/venta * 100)
    - Stock actual
    - Stock mínimo
    - Fecha de creación
    - Última modificación (fecha y dispositivo)
    - Imagen (si existe)

    2. **DADO** que estoy en el detalle de un producto  
    **CUANDO** la información no cabe en pantalla  
    **ENTONCES** puedo hacer scroll vertical para ver todo

    3. **DADO** que estoy en el detalle  
    **CUANDO** presiono el botón "Editar"  
    **ENTONCES** entro en modo edición (ver HU-003)

    4. **DADO** que estoy en el detalle  
    **CUANDO** presiono el código de barras  
    **ENTONCES** se copia al portapapeles con confirmación visual

    5. **DADO** que estoy en el detalle  
    **CUANDO** presiono "Ver historial"  
    **ENTONCES** veo lista de movimientos de stock de este producto

    6. **DADO** que presiono el botón atrás/cerrar  
    **CUANDO** vuelvo a la lista  
    **ENTONCES** se mantiene la posición de scroll donde estaba

    **Acciones rápidas:**
    7. Botón flotante con:
    - Editar producto
    - Registrar entrada de stock
    - Registrar salida de stock
    - Eliminar producto
    - Compartir (futuro)

    **Definición de Hecho:**
    - Toda la info visible y legible
    - Acciones contextuales
    - Funciona offline
    - Diseño responsive
    - Loading states

    ---

    ### HU-007: Asociar código de barras a producto existente

    **Como** usuario del sistema  
    **Quiero** agregar un código de barras a un producto que se creó sin uno  
    **Para** poder escanearlo en el futuro

    **Criterios de Aceptación:**

    1. **DADO** que estoy editando un producto sin código de barras  
    **CUANDO** presiono el campo "Código de barras"  
    **ENTONCES** puedo: (a) escribirlo manualmente, o (b) presionar botón "Escanear" (solo en móvil)

    2. **DADO** que presioné "Escanear" en móvil  
    **CUANDO** escaneo un código válido  
    **ENTONCES** el código se inserta en el campo automáticamente

    3. **DADO** que ingresé un código de barras  
    **CUANDO** el código ya existe en otro producto  
    **ENTONCES** se muestra error "Código de barras ya usado en [Nombre del producto]" con opción de ver ese producto

    4. **DADO** que ingresé un código válido y único  
    **CUANDO** guardo el producto  
    **ENTONCES** el código queda asociado y ahora puedo encontrar el producto escaneando

    5. **DADO** que un producto ya tiene código de barras  
    **CUANDO** quiero cambiarlo  
    **ENTONCES** puedo editarlo igual que cualquier otro campo con las mismas validaciones

    **Validaciones:**
    - Código debe ser numérico
    - Longitud: 8, 12 o 13 dígitos (EAN/UPC estándar)
    - Único en toda la base de datos
    - Checksum digit validation (opcional pero recomendado)

    **Definición de Hecho:**
    - Funciona desde web y móvil
    - Validación de unicidad
    - Escaneo directo desde edición (móvil)
    - Sincronización del código

    ---

    ### HU-008: Duplicar producto como plantilla

    **Como** usuario del sistema  
    **Quiero** duplicar un producto existente  
    **Para** crear uno similar más rápido sin llenar todos los campos

    **Criterios de Aceptación:**

    1. **DADO** que estoy en el detalle de un producto  
    **CUANDO** presiono "Duplicar"  
    **ENTONCES** se abre el formulario de creación con todos los campos copiados EXCEPTO:
    - ID (se genera uno nuevo)
    - Código de barras (queda vacío)
    - Nombre (se agrega " - Copia" al final)
    - Stock (se pone en 0)

    2. **DADO** que el formulario de duplicado está abierto  
    **CUANDO** modifico los campos necesarios  
    **ENTONCES** puedo guardar como un nuevo producto independiente

    3. **DADO** que guardé el duplicado  
    **CUANDO** veo la lista  
    **ENTONCES** aparecen ambos productos (original y copia) como entidades separadas

    **Campos que SÍ se copian:**
    - Descripción
    - Categoría
    - Precio de costo
    - Precio de venta
    - Stock mínimo
    - Imagen (referencia a la misma imagen)

    **Definición de Hecho:**
    - Copia todo excepto identificadores únicos
    - Indicador visual de que es copia
    - No afecta al producto original

    ---

    ## Módulo: Escaneo de Productos

    ### HU-009: Escanear código de barras desde app móvil

    **Como** usuario de la app móvil  
    **Quiero** escanear códigos de barras de forma rápida y fluida  
    **Para** identificar productos sin escribir nada

    **Criterios de Aceptación:**

    1. **DADO** que abro la app móvil  
    **CUANDO** presiono el botón "Escanear" en la pantalla principal  
    **ENTONCES** se activa la cámara con:
    - Marco rectangular guía para el código
    - Instrucción: "Apunta al código de barras"
    - Botón de flash (toggle)
    - Botón de cambiar cámara (frontal/trasera)

    2. **DADO** que la cámara está activa  
    **CUANDO** un código de barras entra en el marco  
    **ENTONCES** se detecta automáticamente en menos de 1 segundo con feedback (vibración + sonido)

    3. **DADO** que el código fue detectado  
    **CUANDO** el producto existe en el sistema  
    **ENTONCES** se cierra la cámara y se muestra el detalle del producto

    4. **DADO** que el código fue detectado  
    **CUANDO** el producto NO existe  
    **ENTONCES** se muestra opción "Crear nuevo producto con código [XXX]"

    5. **DADO** que estoy escaneando  
    **CUANDO** presiono el botón "Cancelar" o back  
    **ENTONCES** se cierra la cámara y vuelvo a la pantalla anterior

    6. **DADO** que no tengo permisos de cámara  
    **CUANDO** intento escanear  
    **ENTONCES** se muestra mensaje claro "Se necesita acceso a la cámara" con botón para ir a configuración

    **Formatos soportados:**
    - EAN-13 (más común en productos)
    - UPC-A
    - Code-128
    - Code-39 (opcional)

    **Performance:**
    - Detección en menos de 1 segundo
    - No consumir batería excesiva
    - Auto-foco continuo

    **Definición de Hecho:**
    - Funciona en condiciones de luz normal y baja
    - Flash funcional
    - Feedback háptico y sonoro
    - Manejo de errores y permisos

    ---

    ### HU-010: Ver producto escaneado inmediatamente después del escaneo

    **Como** usuario que acaba de escanear un código  
    **Quiero** ver la información del producto de inmediato  
    **Para** verificar que es el correcto y tomar acciones

    **Criterios de Aceptación:**

    1. **DADO** que escaneé un código de barras exitosamente  
    **CUANDO** el producto existe en el sistema  
    **ENTONCES** se muestra pantalla de detalle del producto con:
    - Destacado visual "Recién escaneado"
    - Toda la información del producto
    - Botones de acción rápida: "Editar", "Entrada stock", "Salida stock"

    2. **DADO** que estoy viendo el producto recién escaneado  
    **CUANDO** veo la información  
    **ENTONCES** el producto se registra automáticamente en la tabla "scanned_items" con timestamp y device_id

    3. **DADO** que el producto fue registrado en scanned_items  
    **CUANDO** hay conexión a internet  
    **ENTONCES** se sincroniza a Supabase y aparece en la pestaña "Escaneados" de todos los dispositivos

    4. **DADO** que estoy offline al escanear  
    **CUANDO** completo el escaneo  
    **ENTONCES** el producto se muestra igual, pero el registro de scanned_items queda en cola de sincronización

    5. **DADO** que presiono "Escanear otro"  
    **CUANDO** confirmo  
    **ENTONCES** vuelvo a la cámara para escanear el siguiente producto

    **Definición de Hecho:**
    - Transición fluida de cámara a detalle
    - Registro automático en scanned_items
    - Funciona offline
    - Acciones rápidas disponibles

    ---

    ### HU-011: Escanear producto que no existe en el sistema

    **Como** usuario que escanea un código nuevo  
    **Quiero** que el sistema me guíe para crear el producto  
    **Para** no perder tiempo buscando cómo agregarlo

    **Criterios de Aceptación:**

    1. **DADO** que escaneé un código de barras  
    **CUANDO** el producto NO existe en el sistema  
    **ENTONCES** se muestra pantalla:
    - "Producto no encontrado"
    - Código escaneado (con opción de copiar)
    - Botón principal: "Crear producto"
    - Botón secundario: "Escanear otro"

    2. **DADO** que presioné "Crear producto"  
    **CUANDO** se abre el formulario  
    **ENTONCES** el campo "Código de barras" ya está prellenado y bloqueado (no editable)

    3. **DADO** que completé los datos del nuevo producto  
    **CUANDO** guardo  
    **ENTONCES** se crea el producto Y se registra en scanned_items (como si lo hubiera escaneado después de crearlo)

    4. **DADO** que presioné "Escanear otro"  
    **CUANDO** confirmo  
    **ENTONCES** vuelvo a la cámara sin crear el producto

    **Búsqueda externa (Feature futuro):**
    5. Botón "Buscar en internet" que consulta APIs de productos por código de barras (Open Food Facts, UPC Database) para autocompletar nombre y descripción

    **Definición de Hecho:**
    - Mensaje claro de "no encontrado"
    - Flujo de creación directo
    - Código pre-llenado
    - Opción de cancelar

    ---

    ### HU-012: Ver historial de productos escaneados

    **Como** usuario del sistema  
    **Quiero** ver una lista de todos los productos que he escaneado recientemente  
    **Para** acceder rápido a productos frecuentes o revisar qué escaneé

    **Criterios de Aceptación:**

    1. **DADO** que estoy en la aplicación (web o móvil)  
    **CUANDO** accedo a la pestaña/sección "Escaneados"  
    **ENTONCES** veo lista de productos escaneados ordenados por fecha/hora (más reciente primero)

    2. **DADO** que veo la lista de escaneados  
    **CUANDO** hay productos escaneados  
    **ENTONCES** cada item muestra:
    - Nombre del producto
    - Código de barras
    - Cuándo fue escaneado (ej: "Hace 5 min", "Hoy 14:30", "Ayer")
    - Desde qué dispositivo (ej: icono móvil o web)
    - Estado: "Visto" o "No visto"

    3. **DADO** que hay múltiples escaneos del mismo producto  
    **CUANDO** veo la lista  
    **ENTONCES** cada escaneo aparece como entrada separada (no se agrupan)

    4. **DADO** que hago clic/tap en un producto escaneado  
    **CUANDO** se abre el detalle  
    **ENTONCES** se marca automáticamente como "Visto" (is_viewed = true)

    5. **DADO** que estoy en la pestaña Escaneados en PC  
    **CUANDO** alguien escanea un producto desde el celular  
    **ENTONCES** aparece en mi lista automáticamente en tiempo real con animación de "nuevo item"

    6. **DADO** que hay muchos escaneados  
    **CUANDO** hago scroll hacia abajo  
    **ENTONCES** se cargan más items (paginación infinita de 50 items)

    **Filtros disponibles:**
    - Mostrar solo "No vistos"
    - Filtrar por dispositivo
    - Filtrar por rango de fechas
    - Buscar por nombre de producto

    **Definición de Hecho:**
    - Lista sincronizada en tiempo real
    - Ordenamiento por timestamp
    - Paginación eficiente
    - Indicadores visuales de estado

    ---

    ### HU-013: Marcar producto escaneado como visto

    **Como** usuario del sistema  
    **Quiero** marcar productos escaneados como "vistos"  
    **Para** llevar control de cuáles ya revisé

    **Criterios de Aceptación:**

    1. **DADO** que estoy en la lista de Escaneados  
    **CUANDO** hago clic/tap en un producto escaneado  
    **ENTONCES** se marca automáticamente como visto (sin necesidad de acción manual)

    2. **DADO** que un producto está marcado como visto  
    **CUANDO** veo la lista  
    **ENTONCES** tiene un indicador visual diferente (ej: texto gris, check verde, opacidad reducida)

    3. **DADO** que quiero marcar como visto sin abrir el detalle  
    **CUANDO** hago swipe/clic derecho en el item  
    **ENTONCES** aparece opción "Marcar como visto" que lo marca sin navegar

    4. **DADO** que marqué un item como visto  
    **CUANDO** hay conexión  
    **ENTONCES** el cambio se sincroniza y se refleja en todos los dispositivos

    5. **DADO** que activé el filtro "Solo no vistos"  
    **CUANDO** marco un item como visto  
    **ENTONCES** desaparece de la lista actual (porque el filtro lo oculta)

    **Marcar múltiples:**
    6. **DADO** que seleccioné varios items (checkbox)  
    **CUANDO** presiono "Marcar como vistos"  
    **ENTONCES** todos los seleccionados cambian a estado visto

    **Definición de Hecho:**
    - Marca automática al abrir detalle
    - Opción de marca manual
    - Sincronización de estado
    - Selección múltiple

    ---

    ### HU-014: Limpiar lista de productos escaneados

    **Como** usuario del sistema  
    **Quiero** eliminar productos escaneados antiguos  
    **Para** mantener la lista limpia y relevante

    **Criterios de Aceptación:**

    1. **DADO** que estoy en la pestaña Escaneados  
    **CUANDO** presiono el botón "Limpiar lista"  
    **ENTONCES** se muestra diálogo con opciones:
    - "Eliminar todos"
    - "Eliminar solo vistos"
    - "Eliminar anteriores a [fecha]"

    2. **DADO** que seleccioné "Eliminar todos"  
    **CUANDO** confirmo  
    **ENTONCES** se borran TODOS los registros de scanned_items (en todos los dispositivos tras sincronizar)

    3. **DADO** que seleccioné "Eliminar solo vistos"  
    **CUANDO** confirmo  
    **ENTONCES** se borran solo los items con is_viewed = true

    4. **DADO** que seleccioné "Eliminar anteriores a [fecha]"  
    **CUANDO** elijo una fecha y confirmo  
    **ENTONCES** se borran todos los items escaneados antes de esa fecha

    5. **DADO** que confirmé la eliminación  
    **CUANDO** la acción se completa  
    **ENTONCES** se muestra confirmación "X productos eliminados" y la lista se actualiza

    6. **DADO** que eliminé items offline  
    **CUANDO** se sincroniza  
    **ENTONCES** esos items se borran también en Supabase y otros dispositivos

    **Restauración:**
    - NO hay opción de deshacer (los registros se borran permanentemente)
    - Se recomienda agregar confirmación "Esta acción no se puede deshacer"

    **Auto-limpieza (configuración):**
    7. **DADO** que configuré auto-limpieza en Settings  
    **CUANDO** pasan X días (configurable: 7, 30, 90)  
    **ENTONCES** el sistema elimina automáticamente scanned_items antiguos

    **Definición de Hecho:**
    - Múltiples opciones de limpieza
    - Confirmación obligatoria
    - Sincronización de eliminación
    - Auto-limpieza configurable

    ---

    ### HU-015: Recibir notificación cuando se escanea un producto (en PC)

    **Como** usuario trabajando en la PC  
    **Quiero** recibir notificación cuando alguien escanea un producto desde el celular  
    **Para** estar al tanto sin tener que mirar la pantalla constantemente

    **Criterios de Aceptación:**

    1. **DADO** que tengo el programa de escritorio abierto  
    **CUANDO** otro dispositivo (celular) escanea un producto  
    **ENTONCES** recibo notificación visual en la esquina de la ventana mostrando:
    - Nombre del producto escaneado
    - Código de barras
    - "Escaneado desde [dispositivo]"
    - Duración: 5 segundos o hasta cerrarla

    2. **DADO** que recibí una notificación de escaneo  
    **CUANDO** hago clic en la notificación  
    **ENTONCES** navego al detalle de ese producto

    3. **DADO** que estoy en la pestaña "Escaneados" en PC  
    **CUANDO** llega un nuevo escaneo  
    **ENTONCES** el item aparece en la lista con animación de entrada (slide-in o fade-in)

    4. **DADO** que tengo el programa minimizado  
    **CUANDO** se escanea un producto  
    **ENTONCES** el icono de la barra de tareas muestra badge con número de notificaciones

    5. **DADO** que configuré las notificaciones  
    **CUANDO** voy a Settings  
    **ENTONCES** puedo activar/desactivar: "Notificaciones de escaneo" (ON/OFF)

    **Notificaciones del sistema (Electron):**
    6. **DADO** que di permisos de notificaciones del sistema  
    **CUANDO** el programa está minimizado y se escanea un producto  
    **ENTONCES** recibo notificación nativa del sistema operativo (Windows/Mac/Linux)

    **Definición de Hecho:**
    - Notificaciones en tiempo real (WebSockets)
    - Toast/banner visual
    - Clickeable para ver detalle
    - Notificaciones del sistema operativo
    - Configurable en settings
    - No spam (máximo 1 notificación cada 3 segundos)

    ---

    ### HU-016: Escanear código de barras desde webcam en PC

    **Como** usuario del programa de escritorio con webcam  
    **Quiero** poder escanear códigos de barras directamente desde el programa  
    **Para** no depender del celular para escaneos rápidos

    **Criterios de Aceptación:**

    1. **DADO** que estoy en el programa de escritorio y tengo webcam  
    **CUANDO** presiono el botón "Escanear con cámara"  
    **ENTONCES** se solicita permiso de cámara y se activa una ventana con vista de webcam

    2. **DADO** que la webcam está activa  
    **CUANDO** acerco un código de barras a la cámara  
    **ENTONCES** se detecta automáticamente igual que en móvil con feedback visual

    3. **DADO** que no tengo webcam o no di permisos  
    **CUANDO** intento escanear  
    **ENTONCES** se muestra mensaje "Webcam no disponible" y se oculta el botón

    4. **DADO** que detecté un código  
    **CUANDO** el escaneo es exitoso  
    **ENTONCES** se cierra la webcam y funciona igual que HU-009 (busca producto, etc.)

    **Limitaciones:**
    - Calidad de lectura depende de la webcam
    - Puede requerir buena iluminación

    **Alternativa de input manual:**
    5. **DADO** que no puedo/quiero usar cámara  
    **CUANDO** presiono "Ingresar código manualmente"  
    **ENTONCES** aparece campo de texto para escribir el código de barras

    **Definición de Hecho:**
    - Librería: QuaggaJS o ZXing
    - Detección funcional en PC
    - Manejo de permisos
    - Fallback a input manual

    ---

    ## Módulo: Inventario

    ### HU-017: Registrar entrada de stock de un producto

    **Como** usuario del sistema  
    **Quiero** registrar cuando ingresa mercadería  
    **Para** mantener el stock actualizado

    **Criterios de Aceptación:**

    1. **DADO** que estoy viendo el detalle de un producto  
    **CUANDO** presiono "Entrada de stock"  
    **ENTONCES** se abre formulario con:
    - Producto (pre-seleccionado, no editable)
    - Cantidad* (obligatorio, número positivo)
    - Motivo: "Compra" | "Devolución" | "Ajuste" | "Otro"
    - Notas (opcional, texto libre)

    2. **DADO** que completé la cantidad  
    **CUANDO** presiono "Guardar"  
    **ENTONCES** se crea registro en inventory_movements con:
    - movement_type = "entry"
    - quantity (positivo)
    - reason
    - timestamp
    - created_by (device_id)

    3. **DADO** que se guardó el movimiento  
    **CUANDO** se procesa  
    **ENTONCES** el stock_quantity del producto se incrementa en esa cantidad automáticamente

    4. **DADO** que registré una entrada  
    **CUANDO** veo el detalle del producto  
    **ENTONCES** el stock muestra el nuevo valor actualizado

    5. **DADO** que registré offline  
    **CUANDO** se sincroniza  
    **ENTONCES** el movimiento se sube a Supabase y el stock se actualiza en todos los dispositivos

    **Validaciones:**
    - Cantidad debe ser número entero positivo > 0
    - Máximo: 999,999 (límite razonable)

    **Definición de Hecho:**
    - Actualización automática de stock
    - Registro en historial
    - Sincronización
    - Validaciones de cantidad

    ---

    ### HU-018: Registrar salida de stock de un producto

    **Como** usuario del sistema  
    **Quiero** registrar cuando vendo o saco mercadería  
    **Para** mantener el stock actualizado

    **Criterios de Aceptación:**

    1. **DADO** que estoy viendo el detalle de un producto  
    **CUANDO** presiono "Salida de stock"  
    **ENTONCES** se abre formulario con:
    - Producto (pre-seleccionado)
    - Cantidad* (obligatorio)
    - Stock actual visible como referencia
    - Motivo: "Venta" | "Merma" | "Donación" | "Ajuste" | "Otro"
    - Notas (opcional)

    2. **DADO** que ingresé una cantidad  
    **CUANDO** la cantidad es mayor que el stock actual  
    **ENTONCES** se muestra warning "Stock actual: X. ¿Seguro querés registrar salida de Y?" pero permite continuar

    3. **DADO** que guardé la salida  
    **CUANDO** se procesa  
    **ENTONCES** se crea registro en inventory_movements con movement_type = "exit" y el stock se REDUCE

    4. **DADO** que la salida deja stock negativo  
    **CUANDO** se guarda  
    **ENTONCES** se permite (stock puede ser negativo) pero se muestra alerta en el listado del producto

    5. **DADO** que registré una salida  
    **CUANDO** veo el historial de movimientos  
    **ENTONCES** aparece con signo negativo o color diferente para distinguir de entradas

    **Definición de Hecho:**
    - Reduce stock automáticamente
    - Permite stock negativo (con warning)
    - Registro en historial
    - Validaciones

    ---

    ### HU-019: Ajustar stock manualmente

    **Como** usuario del sistema  
    **Quiero** corregir el stock cuando no coincide con la realidad  
    **Para** mantener datos precisos después de hacer inventario físico

    **Criterios de Aceptación:**

    1. **DADO** que estoy en el detalle de un producto  
    **CUANDO** presiono "Ajustar stock"  
    **ENTONCES** se muestra formulario:
    - Stock actual: [número] (solo lectura)
    - Nuevo stock*: [campo editable]
    - Diferencia: [calculado automático: nuevo - actual]
    - Motivo del ajuste* (obligatorio): texto libre
    - Notas adicionales

    2. **DADO** que ingresé el nuevo stock  
    **CUANDO** el valor es diferente al actual  
    **ENTONCES** se muestra la diferencia con color: verde si aumenta, rojo si disminuye

    3. **DADO** que guardé el ajuste  
    **CUANDO** se procesa  
    **ENTONCES** se crea movimiento tipo "adjustment" con la diferencia (puede ser positiva o negativa) y se actualiza el stock

    4. **DADO** que el motivo es obligatorio  
    **CUANDO** intento guardar sin motivo  
    **ENTONCES** se muestra error "Debes indicar el motivo del ajuste"

    5. **DADO** que hice un ajuste  
    **CUANDO** veo el historial  
    **ENTONCES** el movimiento aparece con etiqueta especial "Ajuste manual" y muestra el motivo

    **Casos de uso típicos:**
    - Inventario físico mensual
    - Corrección de errores de carga
    - Productos rotos/perdidos
    - Diferencias detectadas

    **Definición de Hecho:**
    - Cálculo automático de diferencia
    - Motivo obligatorio
    - Actualización de stock
    - Trazabilidad en historial

    ---

    ### HU-020: Ver historial de movimientos de un producto

    **Como** usuario del sistema  
    **Quiero** ver todos los movimientos de stock de un producto  
    **Para** auditar y entender cómo varió el stock

    **Criterios de Aceptación:**

    1. **DADO** que estoy en el detalle de un producto  
    **CUANDO** presiono "Ver historial"  
    **ENTONCES** navego a pantalla de historial mostrando tabla/lista con:
    - Fecha y hora
    - Tipo de movimiento (Entrada/Salida/Ajuste)
    - Cantidad (con signo: +10, -5)
    - Stock resultante después del movimiento
    - Motivo
    - Dispositivo/usuario que lo hizo
    - Notas (si hay)

    2. **DADO** que veo el historial  
    **CUANDO** hay muchos movimientos  
    **ENTONCES** están ordenados por fecha descendente (más reciente primero) con paginación

    3. **DADO** que veo un movimiento  
    **CUANDO** es una entrada  
    **ENTONCES** la cantidad se muestra en verde con signo + (ej: +20)

    4. **DADO** que veo un movimiento  
    **CUANDO** es una salida  
    **ENTONCES** la cantidad se muestra en rojo con signo - (ej: -15)

    5. **DADO** que veo un movimiento  
    **CUANDO** es un ajuste  
    **ENTONCES** se muestra en amarillo/naranja con el motivo destacado

    6. **DADO** que hago clic en un movimiento  
    **CUANDO** se expande  
    **ENTONCES** veo detalles completos incluyendo notas y timestamp exacto

    **Filtros:**
    - Por tipo de movimiento
    - Por rango de fechas
    - Buscar en notas/motivos

    **Exportación:**
    7. **DADO** que presiono "Exportar historial"  
    **CUANDO** confirmo  
    **ENTONCES** se descarga CSV con todos los movimientos del producto

    **Definición de Hecho:**
    - Lista ordenada cronológicamente
    - Códigos de color por tipo
    - Filtros funcionales
    - Exportación a CSV

    ---

    ### HU-021: Recibir alerta de stock bajo/mínimo

    **Como** usuario del sistema  
    **Quiero** recibir alertas cuando un producto llega a stock mínimo  
    **Para** reponerlo a tiempo

    **Criterios de Aceptación:**

    1. **DADO** que un producto tiene stock_min configurado (ej: 10)  
    **CUANDO** una salida o ajuste deja stock_quantity <= stock_min  
    **ENTONCES** se genera una alerta que aparece en el dashboard

    2. **DADO** que hay productos con stock bajo  
    **CUANDO** abro el dashboard  
    **ENTONCES** veo sección "Alertas de stock" con lista de productos que necesitan reposición

    3. **DADO** que veo la lista de alertas  
    **CUANDO** cada producto se muestra  
    **ENTONCES** incluye:
    - Nombre del producto
    - Stock actual
    - Stock mínimo configurado
    - Diferencia (ej: "Faltan 5 unidades")
    - Botón "Registrar entrada"

    4. **DADO** que hago clic en "Registrar entrada" desde la alerta  
    **CUANDO** registro entrada que sube el stock sobre el mínimo  
    **ENTONCES** la alerta desaparece automáticamente

    5. **DADO** que configuré notificaciones  
    **CUANDO** un producto alcanza stock mínimo  
    **ENTONCES** recibo notificación visual (y opcionalmente del sistema)

    **Configuración por producto:**
    6. **DADO** que edito un producto  
    **CUANDO** configuro "Stock mínimo" en 0  
    **ENTONCES** ese producto NO genera alertas de stock bajo

    **Definición de Hecho:**
    - Alertas automáticas
    - Dashboard con sección dedicada
    - Acción rápida desde alerta
    - Configurable por producto

    ---

    ### HU-022: Ver productos con stock crítico

    **Como** usuario del sistema  
    **Quiero** ver un listado de todos los productos con stock bajo  
    **Para** planificar reposiciones

    **Criterios de Aceptación:**

    1. **DADO** que estoy en el dashboard o menú  
    **CUANDO** presiono "Stock crítico"  
    **ENTONCES** veo lista filtrada de productos donde stock_quantity <= stock_min

    2. **DADO** que veo la lista de stock crítico  
    **CUANDO** hay productos  
    **ENTONCES** se muestran ordenados por criticidad:
    - Stock 0 o negativo (primero, en rojo)
    - Stock 1 a stock_min (después, en naranja)

    3. **DADO** que veo un producto en la lista  
    **CUANDO** observo la información  
    **ENTONCES** veo:
    - Nombre
    - Stock actual vs stock mínimo
    - Categoría
    - Última venta/salida
    - Botón acción rápida "Entrada"

    4. **DADO** que no hay productos con stock crítico  
    **CUANDO** accedo a la sección  
    **ENTONCES** veo mensaje motivacional "¡Todo en orden! No hay productos con stock bajo"

    5. **DADO** que presiono "Exportar"  
    **CUANDO** confirmo  
    **ENTONCES** descargo CSV con listado de productos críticos para compartir con proveedor

    **Badge en menú:**
    6. **DADO** que hay productos con stock crítico  
    **CUANDO** veo el menú/navbar  
    **ENTONCES** el icono/botón "Stock crítico" muestra badge con número de productos afectados

    **Definición de Hecho:**
    - Filtro automático por stock crítico
    - Ordenamiento por criticidad
    - Exportación
    - Badge de notificación

    ---

    ### HU-023: Hacer inventario físico con escaneo masivo

    **Como** usuario del sistema  
    **Quiero** escanear productos rápidamente al hacer inventario  
    **Para** ajustar todo el stock en una sesión

    **Criterios de Aceptación:**

    1. **DADO** que estoy en la app móvil  
    **CUANDO** presiono "Inventario físico"  
    **ENTONCES** entro a modo especial donde:
    - La cámara queda activa continuamente
    - Cada escaneo se acumula en una lista temporal
    - Puedo escanear múltiples productos seguidos

    2. **DADO** que estoy en modo inventario  
    **CUANDO** escaneo un producto  
    **ENTONCES** se agrega a lista temporal con:
    - Nombre del producto
    - Cantidad escaneada (contador: cada escaneo suma 1)
    - Opción de editar cantidad manualmente

    3. **DADO** que escaneé el mismo producto varias veces  
    **CUANDO** veo la lista temporal  
    **ENTONCES** aparece una sola vez con la suma total (ej: "Producto X: 15 unidades")

    4. **DADO** que terminé de escanear  
    **CUANDO** presiono "Finalizar inventario"  
    **ENTONCES** se muestra resumen comparativo:
    - Producto | Stock sistema | Stock físico | Diferencia

    5. **DADO** que veo el resumen  
    **CUANDO** confirmo "Aplicar ajustes"  
    **ENTONCES** se generan movimientos tipo "adjustment" para cada producto y se actualizan todos los stocks

    6. **DADO** que quiero descartar el inventario  
    **CUANDO** presiono "Cancelar"  
    **ENTONCES** se descarta la lista temporal sin afectar stocks

    **Modo rápido:**
    - No muestra detalle de cada producto
    - Solo acumula escaneos
    - Sonido diferente para cada escaneo exitoso

    **Definición de Hecho:**
    - Escaneo continuo sin cerrar cámara
    - Acumulación de cantidades
    - Resumen comparativo
    - Aplicación masiva de ajustes

    ---

    ## Módulo: Precios

    ### HU-024: Establecer precio de costo de un producto

    **Como** usuario del sistema  
    **Quiero** registrar cuánto me cuesta un producto  
    **Para** calcular márgenes y rentabilidad

    **Criterios de Aceptación:**

    1. **DADO** que creo o edito un producto  
    **CUANDO** lleno el campo "Precio de costo"  
    **ENTONCES** acepta números decimales positivos (hasta 2 decimales)

    2. **DADO** que guardé un precio de costo  
    **CUANDO** veo el detalle del producto  
    **ENTONCES** se muestra formateado según la configuración regional (ej: $1,234.56)

    3. **DADO** que un producto tiene precio de venta  
    **CUANDO** ingreso precio de costo  
    **ENTONCES** se calcula y muestra automáticamente el margen de ganancia

    4. **DADO** que dejé el precio de costo vacío  
    **CUANDO** guardo el producto  
    **ENTONCES** se acepta (es opcional) y se guarda como NULL o 0

    **Validaciones:**
    - Debe ser número >= 0
    - Máximo 2 decimales
    - Formato: 9,999,999.99 (7 dígitos enteros + 2 decimales)

    **Definición de Hecho:**
    - Campo opcional
    - Validación numérica
    - Formato de moneda
    - Sincronización

    ---

    ### HU-025: Establecer precio de venta de un producto

    **Como** usuario del sistema  
    **Quiero** registrar el precio al que vendo un producto  
    **Para** tenerlo como referencia

    **Criterios de Aceptación:**

    1. **DADO** que creo o edito un producto  
    **CUANDO** lleno "Precio de venta"  
    **ENTONCES** acepta números positivos con hasta 2 decimales

    2. **DADO** que guardé precio de venta  
    **CUANDO** veo el detalle  
    **ENTONCES** se muestra formateado como moneda

    3. **DADO** que hay precio de costo y venta  
    **CUANDO** veo el producto  
    **ENTONCES** se muestra el margen calculado automáticamente

    4. **DADO** que el precio de venta es menor que el costo  
    **CUANDO** guardo  
    **ENTONCES** se muestra warning "Precio de venta menor al costo (margen negativo)" pero permite guardar

    **Validaciones:**
    - Mismo formato que precio de costo
    - Opcional

    **Definición de Hecho:**
    - Campo opcional
    - Warning si venta < costo
    - Cálculo automático de margen
    - Sincronización

    ---

    ### HU-026: Ver margen de ganancia automáticamente

    **Como** usuario del sistema  
    **Quiero** ver el margen de ganancia calculado  
    **Para** saber qué tan rentable es un producto

    **Criterios de Aceptación:**

    1. **DADO** que un producto tiene precio_cost y price_sale  
    **CUANDO** veo el detalle del producto  
    **ENTONCES** se muestra el margen calculado como:
    - Porcentaje: ((price_sale - price_cost) / price_sale) × 100
    - Valor absoluto: price_sale - price_cost

    2. **DADO** que el margen es positivo  
    **CUANDO** se muestra  
    **ENTONCES** aparece en verde (ej: "+45.5% ($123.45)")

    3. **DADO** que el margen es negativo (pérdida)  
    **CUANDO** se muestra  
    **ENTONCES** aparece en rojo (ej: "-12% (-$50)")

    4. **DADO** que falta precio de costo o venta  
    **CUANDO** veo el detalle  
    **ENTONCES** el margen muestra "N/A" o "-"

    5. **DADO** que edito precio de costo o venta  
    **CUANDO** modifico el valor  
    **ENTONCES** el margen se recalcula en tiempo real (sin guardar)

    **Fórmula:**
    ```
    margen_porcentaje = ((price_sale - price_cost) / price_sale) × 100
    margen_absoluto = price_sale - price_cost
    ```

    **Definición de Hecho:**
    - Cálculo automático
    - Actualización en tiempo real
    - Códigos de color
    - No se guarda en BD (se calcula al mostrar)

    ---

    ### HU-027: Actualizar precios de forma masiva por categoría

    **Como** usuario del sistema  
    **Quiero** actualizar precios de todos los productos de una categoría  
    **Para** ajustar precios de forma eficiente

    **Criterios de Aceptación:**

    1. **DADO** que estoy en la lista de productos  
    **CUANDO** filtro por una categoría y presiono "Actualización masiva de precios"  
    **ENTONCES** se abre modal con opciones:
    - Aumentar/Disminuir por porcentaje
    - Aumentar/Disminuir valor fijo
    - Aplicar a: precio costo | precio venta | ambos

    2. **DADO** que seleccioné "Aumentar 10%"  
    **CUANDO** aplico a precio de venta  
    **ENTONCES** se muestra preview de cambios antes de confirmar

    3. **DADO** que veo el preview  
    **CUANDO** confirmo  
    **ENTONCES** se actualizan todos los productos de la categoría y se registra en historial de precios

    4. **DADO** que actualicé precios masivamente  
    **CUANDO** hay conexión  
    **ENTONCES** todos los cambios se sincronizan

    **Seguridad:**
    5. Confirmación obligatoria
    6. Preview de cambios
    7. Opción de deshacer (últimos 5 minutos)

    **Definición de Hecho:**
    - Actualización por categoría
    - Preview antes de aplicar
    - Registro en historial
    - Sincronización

    ---

    ### HU-028: Ver historial de cambios de precio

    **Como** usuario del sistema  
    **Quiero** ver cómo varió el precio de un producto  
    **Para** analizar tendencias y decisiones pasadas

    **Criterios de Aceptación:**

    1. **DADO** que edito el precio de un producto  
    **CUANDO** guardo el cambio  
    **ENTONCES** se crea registro en tabla price_history con:
    - product_id
    - old_price_cost
    - new_price_cost
    - old_price_sale
    - new_price_sale
    - changed_at (timestamp)
    - changed_by (device_id)

    2. **DADO** que estoy en detalle de producto  
    **CUANDO** presiono "Historial de precios"  
    **ENTONCES** veo lista cronológica de cambios

    3. **DADO** que veo el historial  
    **CUANDO** hay cambios  
    **ENTONCES** cada entrada muestra:
    - Fecha
    - Precio anterior → Precio nuevo
    - Porcentaje de cambio
    - Quién lo cambió

    4. **DADO** que veo un cambio de precio  
    **CUANDO** el precio subió  
    **ENTONCES** se muestra en verde con flecha ↑

    5. **DADO** que veo un cambio de precio  
    **CUANDO** el precio bajó  
    **ENTONCES** se muestra en rojo con flecha ↓

    **Gráfico (feature adicional):**
    6. Mostrar gráfico de línea con evolución de precios en el tiempo

    **Definición de Hecho:**
    - Registro automático de cambios
    - Vista cronológica
    - Indicadores visuales
    - Sincronización

    ---

    ## Módulo: Categorización

    ### HU-029: Crear nueva categoría

    **Como** usuario del sistema  
    **Quiero** crear categorías  
    **Para** organizar mis productos

    **Criterios de Aceptación:**

    1. **DADO** que estoy en la sección Categorías  
    **CUANDO** presiono "+ Nueva categoría"  
    **ENTONCES** se abre formulario con:
    - Nombre* (obligatorio)
    - Categoría padre (opcional, select)
    - Color (selector de color)
    - Icono (selector de iconos)

    2. **DADO** que completé el nombre  
    **CUANDO** guardo  
    **ENTONCES** se crea la categoría con ID único

    3. **DADO** que el nombre ya existe  
    **CUANDO** intento guardar  
    **ENTONCES** se muestra error "Ya existe una categoría con ese nombre"

    4. **DADO** que seleccioné categoría padre  
    **CUANDO** guardo  
    **ENTONCES** se crea como subcategoría

    **Validaciones:**
    - Nombre único
    - Máximo 50 caracteres
    - Color hex válido
    - Icono de set predefinido

    **Definición de Hecho:**
    - Creación de categorías
    - Validación de unicidad
    - Soporte de jerarquía
    - Sincronización

    ---

    ### HU-030: Editar categoría existente

    **Como** usuario del sistema  
    **Quiero** modificar categorías  
    **Para** corregir nombres o cambiar organización

    **Criterios de Aceptación:**

    1. **DADO** que estoy en lista de categorías  
    **CUANDO** selecciono una y presiono "Editar"  
    **ENTONCES** puedo modificar nombre, color, icono, categoría padre

    2. **DADO** que cambié el nombre a uno existente  
    **CUANDO** intento guardar  
    **ENTONCES** se muestra error de duplicado

    3. **DADO** que una categoría tiene productos asociados  
    **CUANDO** la edito  
    **ENTONCES** los productos mantienen la asociación (se actualizan automáticamente)

    4. **DADO** que cambié categoría padre  
    **CUANDO** guardo  
    **ENTONCES** se reorganiza en la jerarquía

    **Definición de Hecho:**
    - Edición de todos los campos
    - Validación de unicidad
    - Productos se actualizan
    - Sincronización

    ---

    ### HU-031: Eliminar categoría

    **Como** usuario del sistema  
    **Quiero** eliminar categorías que no uso  
    **Para** mantener la lista limpia

    **Criterios de Aceptación:**

    1. **DADO** que seleccioné una categoría  
    **CUANDO** presiono "Eliminar"  
    **ENTONCES** se muestra confirmación

    2. **DADO** que la categoría tiene productos asociados  
    **CUANDO** intento eliminar  
    **ENTONCES** se muestra:
    - "Esta categoría tiene X productos. ¿Qué deseas hacer?"
    - Opción A: "Mover productos a [otra categoría]"
    - Opción B: "Dejar productos sin categoría"
    - Opción C: "Cancelar"

    3. **DADO** que la categoría NO tiene productos  
    **CUANDO** confirmo eliminación  
    **ENTONCES** se elimina (soft delete: is_active = false)

    4. **DADO** que la categoría tiene subcategorías  
    **CUANDO** intento eliminar  
    **ENTONCES** se muestra error "No se puede eliminar. Primero elimina las subcategorías"

    **Definición de Hecho:**
    - Validación de productos asociados
    - Opciones de migración
    - Soft delete
    - Protección de jerarquía

    ---

    ### HU-032: Asignar producto a categoría

    **Como** usuario del sistema  
    **Quiero** asignar productos a categorías  
    **Para** organizarlos

    **Criterios de Aceptación:**

    1. **DADO** que creo o edito un producto  
    **CUANDO** selecciono categoría del dropdown  
    **ENTONCES** se asocia al producto

    2. **DADO** que un producto tiene categoría  
    **CUANDO** veo el detalle  
    **ENTONCES** se muestra con color e icono de la categoría

    3. **DADO** que cambio la categoría  
    **CUANDO** guardo  
    **ENTONCES** se actualiza la asociación

    4. **DADO** que dejo categoría vacía  
    **CUANDO** guardo  
    **ENTONCES** el producto queda sin categoría (NULL)

    **Definición de Hecho:**
    - Select de categorías
    - Visual con color/icono
    - Cambio de categoría
    - Sincronización

    ---

    ### HU-033: Crear subcategorías (categorías jerárquicas)

    **Como** usuario del sistema  
    **Quiero** crear subcategorías dentro de categorías  
    **Para** organizar mejor los productos

    **Criterios de Aceptación:**

    1. **DADO** que creo una categoría  
    **CUANDO** selecciono "Categoría padre"  
    **ENTONCES** puedo elegir cualquier categoría existente

    2. **DADO** que una categoría es subcategoría  
    **CUANDO** veo la lista  
    **ENTONCES** aparece indentada bajo su padre

    3. **DADO** que veo categorías jerárquicas  
    **CUANDO** las visualizo  
    **ENTONCES** se muestran expandibles/colapsables

    4. **DADO** que selecciono categoría padre  
    **CUANDO** filtro productos  
    **ENTONCES** muestra productos de esa categoría Y sus subcategorías

    **Limitación:**
    - Máximo 3 niveles de profundidad

    **Definición de Hecho:**
    - Jerarquía funcional
    - Vista tree/indentada
    - Filtrado recursivo
    - Sincronización

    ---

    ### HU-034: Filtrar productos por categoría

    **Como** usuario del sistema  
    **Quiero** ver solo productos de una categoría  
    **Para** navegar mejor

    **Criterios de Aceptación:**

    1. **DADO** que estoy en lista de productos  
    **CUANDO** selecciono una categoría del filtro  
    **ENTONCES** solo se muestran productos de esa categoría

    2. **DADO** que filtré por categoría padre  
    **CUANDO** veo resultados  
    **ENTONCES** incluye productos de esa categoría Y subcategorías

    3. **DADO** que hay filtro activo  
    **CUANDO** veo la interfaz  
    **ENTONCES** se muestra chip/badge "Categoría: [Nombre]" con X para limpiar

    4. **DADO** que limpio el filtro  
    **CUANDO** presiono X  
    **ENTONCES** vuelvo a ver todos los productos

    **Definición de Hecho:**
    - Filtro funcional
    - Inclusión de subcategorías
    - Indicador visual de filtro activo
    - Botón limpiar filtro

    ---

    ### HU-035: Mover productos entre categorías

    **Como** usuario del sistema  
    **Quiero** cambiar la categoría de varios productos a la vez  
    **Para** reorganizar eficientemente

    **Criterios de Aceptación:**

    1. **DADO** que estoy en lista de productos  
    **CUANDO** selecciono múltiples productos (checkbox) y presiono "Cambiar categoría"  
    **ENTONCES** se abre modal para elegir nueva categoría

    2. **DADO** que elegí nueva categoría  
    **CUANDO** confirmo  
    **ENTONCES** todos los productos seleccionados cambian de categoría

    3. **DADO** que moví productos  
    **CUANDO** hay conexión  
    **ENTONCES** se sincroniza el cambio

    **Definición de Hecho:**
    - Selección múltiple
    - Cambio masivo
    - Confirmación
    - Sincronización

    ---

    ## Módulo: Sincronización

    ### HU-036: Trabajar sin conexión a internet

    **Como** usuario del sistema  
    **Quiero** seguir usando la aplicación sin internet  
    **Para** no depender de conectividad

    **Criterios de Aceptación:**

    1. **DADO** que pierdo conexión a internet  
    **CUANDO** uso la aplicación  
    **ENTONCES** sigo viendo todos los productos, categorías y datos previamente sincronizados

    2. **DADO** que estoy offline  
    **CUANDO** creo, edito o elimino productos  
    **ENTONCES** las operaciones se guardan localmente en RxDB

    3. **DADO** que hice cambios offline  
    **CUANDO** los guardo  
    **ENTONCES** se agregan a la sync_queue local

    4. **DADO** que estoy offline  
    **CUANDO** veo la interfaz  
    **ENTONCES** aparece indicador claro "Sin conexión" con icono

    5. **DADO** que intento acceder a funciones que requieren internet  
    **CUANDO** estoy offline  
    **ENTONCES** se muestra mensaje "Esta función requiere conexión. Se guardará para sincronizar después"

    **Limitaciones offline:**
    - No puedo usar búsqueda externa de códigos de barras
    - No recibo cambios de otros dispositivos
    - Notificaciones en tiempo real no funcionan

    **Definición de Hecho:**
    - App 100% funcional offline
    - Indicador de estado
    - Cola de sincronización
    - Mensajes claros

    ---

    ### HU-037: Sincronizar cambios automáticamente al recuperar conexión

    **Como** usuario que estuvo offline  
    **Quiero** que mis cambios se suban automáticamente al conectarme  
    **Para** no tener que hacer nada manual

    **Criterios de Aceptación:**

    1. **DADO** que recupero conexión a internet  
    **CUANDO** la app detecta conectividad  
    **ENTONCES** inicia sincronización automáticamente en background

    2. **DADO** que hay cambios en sync_queue  
    **CUANDO** se sincroniza  
    **ENTONCES** se procesan en orden cronológico (FIFO)

    3. **DADO** que estoy sincronizando  
    **CUANDO** el proceso está en curso  
    **ENTONCES** veo indicador "Sincronizando... (X de Y cambios)"

    4. **DADO** que la sincronización termina exitosamente  
    **CUANDO** finaliza  
    **ENTONCES** se muestra notificación "Sincronización completa" y se vacía la queue

    5. **DADO** que algún cambio falla al sincronizar  
    **CUANDO** hay error  
    **ENTONCES** ese cambio se marca con error en la queue y se reintenta después

    6. **DADO** que terminó la sincronización  
    **CUANDO** veo el indicador  
    **ENTONCES** cambia a "Conectado" con timestamp de última sync

    **Estrategia de reintentos:**
    - Primer fallo: reintento inmediato
    - Segundo fallo: espera 30 segundos
    - Tercer fallo: espera 5 minutos
    - Más fallos: notificar al usuario

    **Definición de Hecho:**
    - Sincronización automática
    - Procesamiento por orden
    - Indicadores de progreso
    - Manejo de errores

    ---

    ### HU-038: Ver estado de sincronización en tiempo real

    **Como** usuario del sistema  
    **Quiero** saber si estoy conectado y sincronizado  
    **Para** tener confianza en que mis datos están actualizados

    **Criterios de Aceptación:**

    1. **DADO** que uso la aplicación  
    **CUANDO** veo la interfaz  
    **ENTONCES** hay un indicador de estado visible mostrando:
    - "Conectado" (verde) - online y sincronizado
    - "Sincronizando..." (amarillo) - procesando cambios
    - "Sin conexión" (rojo) - offline
    - "Error de sincronización" (rojo con warning) - fallos

    2. **DADO** que hago clic en el indicador  
    **CUANDO** se expande  
    **ENTONCES** veo detalles:
    - Estado de conexión
    - Última sincronización exitosa (timestamp)
    - Cambios pendientes en queue
    - Errores (si hay)

    3. **DADO** que hay cambios pendientes  
    **CUANDO** veo el indicador  
    **ENTONCES** muestra número "(3 pendientes)"

    4. **DADO** que estoy sincronizado  
    **CUANDO** otro dispositivo hace cambios  
    **ENTONCES** mi indicador muestra brevemente "Recibiendo actualizaciones..."

    5. **DADO** que hay conflictos sin resolver  
    **CUANDO** veo el indicador  
    **ENTONCES** muestra "⚠ Conflictos pendientes" con badge

    **Ubicación del indicador:**
    - Web: esquina superior derecha
    - Móvil: parte superior de la pantalla principal

    **Definición de Hecho:**
    - Indicador siempre visible
    - Estados claros y diferenciados
    - Detalles expandibles
    - Actualización en tiempo real

    ---

    ### HU-039: Forzar sincronización manual

    **Como** usuario del sistema  
    **Quiero** poder forzar una sincronización  
    **Para** asegurarme de que todo está actualizado

    **Criterios de Aceptación:**

    1. **DADO** que veo el indicador de sincronización  
    **CUANDO** lo despliego y presiono "Sincronizar ahora"  
    **ENTONCES** se inicia sincronización inmediata aunque la automática esté programada después

    2. **DADO** que forcé sincronización  
    **CUANDO** se ejecuta  
    **ENTONCES** hace:
    - Push de cambios locales pendientes
    - Pull de cambios remotos nuevos
    - Verifica conflictos

    3. **DADO** que la sincronización manual está en curso  
    **CUANDO** intento forzar otra  
    **ENTONCES** se muestra mensaje "Sincronización en curso, espera a que termine"

    4. **DADO** que estoy offline  
    **CUANDO** intento forzar sync  
    **ENTONCES** se muestra mensaje "No hay conexión. Se sincronizará automáticamente al conectarte"

    **Gesto pull-to-refresh (móvil):**
    5. **DADO** que estoy en la lista de productos  
    **CUANDO** hago gesto de "pull to refresh"  
    **ENTONCES** se fuerza sincronización

    **Definición de Hecho:**
    - Botón/opción manual
    - Pull-to-refresh en móvil
    - Validación de estado
    - Feedback claro

    ---

    ### HU-040: Ver cambios pendientes de sincronizar

    **Como** usuario del sistema  
    **Quiero** ver qué cambios están pendientes  
    **Para** saber qué se va a sincronizar

    **Criterios de Aceptación:**

    1. **DADO** que tengo cambios en sync_queue  
    **CUANDO** despliego el indicador de sincronización  
    **ENTONCES** veo lista de operaciones pendientes

    2. **DADO** que veo la lista  
    **CUANDO** hay cambios  
    **ENTONCES** cada item muestra:
    - Tipo de operación (Crear/Editar/Eliminar)
    - Objeto afectado (ej: "Producto: Coca Cola 500ml")
    - Timestamp del cambio
    - Estado (Pendiente/Sincronizando/Error)

    3. **DADO** que veo un cambio con error  
    **CUANDO** hago clic en él  
    **ENTONCES** veo detalles del error y opción "Reintentar"

    4. **DADO** que hay muchos cambios  
    **CUANDO** veo la lista  
    **ENTONCES** están ordenados cronológicamente y puedo hacer scroll

    **Acciones:**
    5. "Reintentar todos" - reintenta cambios con error
    6. "Limpiar exitosos" - remueve de la vista items ya sincronizados

    **Definición de Hecho:**
    - Vista de queue
    - Detalles de cada cambio
    - Acciones de reintento
    - Ordenamiento cronológico

    ---

    ### HU-041: Recibir notificación de sincronización exitosa

    **Como** usuario del sistema  
    **Quiero** saber cuando la sincronización terminó  
    **Para** confirmar que mis datos están guardados

    **Criterios de Aceptación:**

    1. **DADO** que se completó una sincronización  
    **CUANDO** finalizó exitosamente  
    **ENTONCES** veo notificación breve (toast) "✓ Sincronización completa"

    2. **DADO** que la notificación aparece  
    **CUANDO** veo el mensaje  
    **ENTONCES** dura 3 segundos y desaparece automáticamente (o puedo cerrarla)

    3. **DADO** que sincronicé después de estar offline largo tiempo  
    **CUANDO** termina  
    **ENTONCES** la notificación incluye "X cambios sincronizados"

    4. **DADO** que tengo notificaciones de sync desactivadas en settings  
    **CUANDO** se sincroniza  
    **ENTONCES** NO veo la notificación (solo cambia el indicador)

    **Notificación silenciosa:**
    - No es intrusiva
    - Se puede desactivar
    - Solo aparece en sincronizaciones "importantes" (no cada cambio pequeño)

    **Definición de Hecho:**
    - Toast no intrusivo
    - Configurable en settings
    - Duración adecuada
    - Información útil

    ---

    ### HU-042: Recibir alerta de error en sincronización

    **Como** usuario del sistema  
    **Quiero** saber si hubo problemas al sincronizar  
    **Para** poder resolverlos

    **Criterios de Aceptación:**

    1. **DADO** que un cambio falló al sincronizar  
    **CUANDO** el reintento automático agota los intentos  
    **ENTONCES** veo alerta "⚠ Error de sincronización" persistente

    2. **DADO** que veo la alerta  
    **CUANDO** hago clic  
    **ENTONCES** se abre modal con:
    - Descripción del error
    - Cambios afectados
    - Opciones: "Reintentar", "Ver detalles", "Descartar"

    3. **DADO** que presioné "Ver detalles"  
    **CUANDO** se abre  
    **ENTONCES** veo información técnica del error (útil para debugging)

    4. **DADO** que presioné "Reintentar"  
    **CUANDO** confirmo  
    **ENTONCES** se vuelve a intentar la sincronización de esos cambios

    5. **DADO** que presioné "Descartar"  
    **CUANDO** confirmo con diálogo de advertencia  
    **ENTONCES** se eliminan esos cambios de la queue (se pierden)

    **Tipos de errores comunes:**
    - Error de red (temporal)
    - Conflicto de datos
    - Error de servidor (500)
    - Error de autenticación

    **Definición de Hecho:**
    - Alertas claras y específicas
    - Opciones de resolución
    - Información técnica disponible
    - Confirmación antes de descartar

    ---

    ## Módulo: Resolución de Conflictos

    ### HU-043: Detectar conflicto cuando dos dispositivos modifican el mismo producto

    **Como** sistema  
    **Quiero** detectar cuando el mismo producto fue modificado en dispositivos diferentes  
    **Para** evitar pérdida de datos

    **Criterios de Aceptación:**

    1. **DADO** que Dispositivo A edita Producto X offline y Dispositivo B también edita Producto X offline  
    **CUANDO** ambos se conectan e intentan sincronizar  
    **ENTONCES** el sistema detecta conflicto comparando version numbers

    2. **DADO** que se detectó un conflicto  
    **CUANDO** el sistema lo identifica  
    **ENTONCES** NO sobrescribe automáticamente y marca el conflicto como pendiente de resolución

    3. **DADO** que hay un conflicto pendiente  
    **CUANDO** abro la aplicación  
    **ENTONCES** veo notificación prominente "Hay conflictos que requieren tu atención"

    4. **DADO** que veo la notificación  
    **CUANDO** hago clic  
    **ENTONCES** navego a pantalla de resolución de conflictos

    **Algoritmo de detección:**
    ```
    if (version_local != version_remote && updated_at_local != updated_at_remote) {
    → CONFLICTO
    }
    ```

    **Casos especiales:**
    - Si solo uno modificó → sincronización normal (no hay conflicto)
    - Si ambos hicieron el mismo cambio → sincronización normal
    - Si modificaron campos diferentes → auto-merge si es posible

    **Definición de Hecho:**
    - Detección automática
    - Version tracking
    - No hay pérdida de datos
    - Notificación al usuario

    ---

    ### HU-044: Ver detalles de ambas versiones en conflicto

    **Como** usuario que debe resolver un conflicto  
    **Quiero** ver ambas versiones lado a lado  
    **Para** decidir cuál conservar

    **Criterios de Aceptación:**

    1. **DADO** que estoy en la pantalla de resolución de conflictos  
    **CUANDO** veo un conflicto  
    **ENTONCES** se muestra tabla comparativa:
    - Columna "Mi versión" (cambios locales)
    - Columna "Otra versión" (cambios remotos)
    - Fila por cada campo modificado

    2. **DADO** que veo la comparación  
    **CUANDO** un campo cambió solo en una versión  
    **ENTONCES** se destaca (verde claro) como cambio único

    3. **DADO** que veo la comparación  
    **CUANDO** un campo cambió en AMBAS versiones  
    **ENTONCES** se destaca (rojo claro) como conflicto real

    4. **DADO** que veo la comparación  
    **CUANDO** un campo no cambió en ninguna versión  
    **ENTONCES** se muestra en gris (sin conflicto)

    5. **DADO** que veo cada versión  
    **CUANDO** observo los detalles  
    **ENTONCES** veo también:
    - Timestamp de modificación
    - Dispositivo que hizo el cambio
    - Usuario (si aplica)

    **Ejemplo visual:**
    ```
    Campo         | Mi versión      | Otra versión
    --------------|-----------------|------------------
    Nombre        | Coca Cola 500ml | Coca Cola 500ml  (igual)
    Precio venta  | $150            | $180             (conflicto)
    Stock         | 25              | 20               (conflicto)
    Categoría     | Bebidas         | Bebidas          (igual)
    ```

    **Definición de Hecho:**
    - Comparación lado a lado
    - Highlighting de diferencias
    - Metadata visible
    - UI clara y legible

    ---

    ### HU-045: Elegir mi versión en caso de conflicto

    **Como** usuario resolviendo un conflicto  
    **Quiero** mantener mi versión  
    **Para** descartar los cambios del otro dispositivo

    **Criterios de Aceptación:**

    1. **DADO** que veo un conflicto  
    **CUANDO** presiono "Conservar mi versión"  
    **ENTONCES** se muestra confirmación "Esto descartará los cambios del otro dispositivo. ¿Continuar?"

    2. **DADO** que confirmé  
    **CUANDO** acepto  
    **ENTONCES** se:
    - Guarda mi versión local
    - Incrementa version number
    - Sincroniza a Supabase
    - Sobrescribe la versión remota

    3. **DADO** que elegí mi versión  
    **CUANDO** se aplica  
    **ENTONCES** el conflicto desaparece de la lista y se marca como resuelto

    4. **DADO** que apliqué la resolución  
    **CUANDO** sincroniza  
    **ENTONCES** otros dispositivos reciben mi versión como la "ganadora"

    **Definición de Hecho:**
    - Botón claro "Mi versión"
    - Confirmación obligatoria
    - Sobrescritura en servidor
    - Propagación a otros dispositivos

    ---

    ### HU-046: Elegir la versión del otro dispositivo en caso de conflicto

    **Como** usuario resolviendo un conflicto  
    **Quiero** aceptar la versión del otro dispositivo  
    **Para** descartar mis cambios locales

    **Criterios de Aceptación:**

    1. **DADO** que veo un conflicto  
    **CUANDO** presiono "Aceptar otra versión"  
    **ENTONCES** se muestra confirmación "Esto descartará tus cambios. ¿Continuar?"

    2. **DADO** que confirmé  
    **CUANDO** acepto  
    **ENTONCES** se:
    - Descarta mi versión local
    - Acepta la versión remota
    - Actualiza mi base local
    - Incrementa version number

    3. **DADO** que acepté la otra versión  
    **CUANDO** se aplica  
    **ENTONCES** mi producto local se actualiza con los datos remotos

    4. **DADO** que apliqué la resolución  
    **CUANDO** veo el producto  
    **ENTONCES** refleja los datos de la versión que acepté

    **Definición de Hecho:**
    - Botón claro "Otra versión"
    - Confirmación obligatoria
    - Actualización local
    - Conflicto resuelto

    ---

    ### HU-047: Combinar manualmente ambas versiones en conflicto

    **Como** usuario resolviendo un conflicto  
    **Quiero** elegir campo por campo qué conservar  
    **Para** crear una versión combinada óptima

    **Criterios de Aceptación:**

    1. **DADO** que veo un conflicto  
    **CUANDO** presiono "Combinar manualmente"  
    **ENTONCES** se abre editor interactivo donde cada campo tiene:
    - Radio button "Mi versión" / "Otra versión"
    - Campo editable para ingresar valor custom

    2. **DADO** que estoy en el editor  
    **CUANDO** selecciono valores  
    **ENTONCES** veo preview en tiempo real de cómo quedará el producto

    3. **DADO** que completé la selección  
    **CUANDO** presiono "Aplicar combinación"  
    **ENTONCES** se crea nueva versión con los campos elegidos

    4. **DADO** que apliqué la combinación  
    **CUANDO** se guarda  
    **ENTONCES** se sincroniza como nueva versión incrementando version number

    **Ejemplo de UI:**
    ```
    Precio de venta:
    ⚪ Mi versión: $150
    🔘 Otra versión: $180
    ⚪ Custom: [    ]

    Stock:
    🔘 Mi versión: 25
    ⚪ Otra versión: 20
    ⚪ Custom: [    ]
    ```

    **Validaciones:**
    - Al menos un campo debe elegirse
    - Los valores custom deben ser válidos
    - Se muestran warnings si hay inconsistencias

    **Definición de Hecho:**
    - Editor campo por campo
    - Preview de resultado
    - Validación de entrada
    - Sincronización de versión combinada

    ---

    ### HU-048: Ver historial de conflictos resueltos

    **Como** usuario del sistema  
    **Quiero** ver qué conflictos resolví en el pasado  
    **Para** auditar decisiones

    **Criterios de Aceptación:**

    1. **DADO** que estoy en la sección de Sincronización  
    **CUANDO** presiono "Historial de conflictos"  
    **ENTONCES** veo lista de conflictos resueltos

    2. **DADO** que veo el historial  
    **CUANDO** hay conflictos resueltos  
    **ENTONCES** cada entrada muestra:
    - Producto afectado
    - Fecha/hora del conflicto
    - Fecha/hora de resolución
    - Decisión tomada (Mi versión / Otra / Combinado)
    - Dispositivos involucrados

    3. **DADO** que hago clic en un conflicto  
    **CUANDO** se expande  
    **ENTONCES** veo detalles completos:
    - Ambas versiones que estaban en conflicto
    - Versión final que se aplicó
    - Quién lo resolvió

    4. **DADO** que veo el historial  
    **CUANDO** hay muchos registros  
    **ENTONCES** puedo filtrar por producto, fecha, tipo de resolución

    **Exportación:**
    5. Botón "Exportar historial" genera CSV con todos los conflictos

    **Definición de Hecho:**
    - Lista cronológica
    - Detalles completos
    - Filtros funcionales
    - Exportación

    ---

    ## Módulo: Dashboard y Reportes

    ### HU-049: Ver resumen general del inventario

    **Como** usuario del sistema  
    **Quiero** ver estadísticas generales al abrir la app  
    **Para** tener una visión rápida del estado

    **Criterios de Aceptación:**

    1. **DADO** que abro el dashboard  
    **CUANDO** cargo la pantalla  
    **ENTONCES** veo cards con:
    - Total de productos registrados
    - Total de categorías
    - Productos con stock bajo
    - Valor total del inventario
    - Últimos productos agregados
    - Productos más escaneados (última semana)

    2. **DADO** que veo las estadísticas  
    **CUANDO** hago clic en un card  
    **ENTONCES** navego a la vista detallada (ej: clic en "Stock bajo" → lista de productos críticos)

    3. **DADO** que las estadísticas cargan  
    **CUANDO** hay muchos productos  
    **ENTONCES** los cálculos se hacen eficientemente sin lag

    **Actualización:**
    4. Las estadísticas se actualizan cada vez que cambio algo (tiempo real)

    **Definición de Hecho:**
    - Cards informativos
    - Navegación desde cards
    - Cálculos eficientes
    - Actualización en tiempo real

    ---

    ### HU-050: Ver productos más escaneados

    **Como** usuario del sistema  
    **Quiero** ver qué productos se escanean más  
    **Para** identificar productos de alta rotación

    **Criterios de Aceptación:**

    1. **DADO** que estoy en el dashboard o sección de reportes  
    **CUANDO** veo "Productos más escaneados"  
    **ENTONCES** se muestra lista/gráfico con top 10 productos

    2. **DADO** que veo la lista  
    **CUANDO** observo cada producto  
    **ENTONCES** veo:
    - Nombre
    - Cantidad de escaneos
    - Período (última semana/mes)
    - Gráfico de barras horizontal

    3. **DADO** que hago clic en un producto  
    **CUANDO** navego  
    **ENTONCES** veo el detalle del producto

    4. **DADO** que configuro el período  
    **CUANDO** cambio a "Último mes" o "Últimos 3 meses"  
    **ENTONCES** se recalcula la lista

    **Definición de Hecho:**
    - Top 10 productos
    - Visualización clara
    - Filtro por período
    - Navegación a detalle

    ---

    ### HU-051: Ver estadísticas de movimientos de stock

    **Como** usuario del sistema  
    **Quiero** ver gráficos de entradas y salidas  
    **Para** analizar tendencias

    **Criterios de Aceptación:**

    1. **DADO** que estoy en reportes  
    **CUANDO** accedo a "Movimientos de stock"  
    **ENTONCES** veo gráfico de líneas mostrando:
    - Entradas totales por día/semana/mes
    - Salidas totales por día/semana/mes
    - Período configurable

    2. **DADO** que veo el gráfico  
    **CUANDO** hago hover en un punto  
    **ENTONCES** veo tooltip con valor exacto

    3. **DADO** que cambio el período  
    **CUANDO** selecciono "Último mes"  
    **ENTONCES** el gráfico se actualiza

    **Definición de Hecho:**
    - Gráfico de movimientos
    - Períodos configurables
    - Interactividad

    ---

    ### HU-052: Exportar listado de productos a CSV

    **Como** usuario del sistema  
    **Quiero** exportar todos los productos a CSV  
    **Para** usar los datos en Excel o compartirlos

    **Criterios de Aceptación:**

    1. **DADO** que estoy en la lista de productos  
    **CUANDO** presiono "Exportar a CSV"  
    **ENTONCES** se descarga archivo con columnas:
    - ID, Código de barras, Nombre, Descripción, Categoría, Precio costo, Precio venta, Stock, Stock mínimo, Fecha creación

    2. **DADO** que hay filtros activos  
    **CUANDO** exporto  
    **ENTONCES** solo se exportan los productos filtrados

    3. **DADO** que exporté  
    **CUANDO** abro el CSV  
    **ENTONCES** los datos están correctamente formateados (encoding UTF-8, comas como separador)

    **Definición de Hecho:**
    - Exportación funcional
    - Respeta filtros
    - Formato estándar CSV

    ---

    ### HU-053: Ver últimos productos agregados

    **Como** usuario del sistema  
    **Quiero** ver los productos más recientes  
    **Para** acceder rápido a lo que agregué

    **Criterios de Aceptación:**

    1. **DADO** que estoy en el dashboard  
    **CUANDO** veo la sección "Últimos agregados"  
    **ENTONCES** veo lista de los 5 productos más recientes con:
    - Nombre
    - Fecha de creación
    - "Hace X horas/días"

    2. **DADO** que hago clic en uno  
    **CUANDO** navego  
    **ENTONCES** veo el detalle del producto

    3. **DADO** que presiono "Ver todos"  
    **CUANDO** navego  
    **ENTONCES** veo lista completa de productos ordenada por fecha de creación

    **Definición de Hecho:**
    - Widget en dashboard
    - Lista cronológica
    - Navegación a detalle

    ---

    ### HU-054: Ver valor total del inventario

    **Como** usuario del sistema  
    **Quiero** saber cuánto vale todo mi stock  
    **Para** conocer el valor de mi inventario

    **Criterios de Aceptación:**

    1. **DADO** que veo el dashboard  
    **CUANDO** observo las estadísticas  
    **ENTONCES** veo card "Valor total del inventario" mostrando:
    - Valor a precio de costo: Σ(stock × precio_costo)
    - Valor a precio de venta: Σ(stock × precio_venta)
    - Ganancia potencial: diferencia entre ambos

    2. **DADO** que un producto no tiene precio  
    **CUANDO** se calcula el total  
    **ENTONCES** ese producto se excluye del cálculo

    3. **DADO** que el stock es negativo  
    **CUANDO** se calcula  
    **ENTONCES** se toma como 0 para el cálculo

    **Formato:**
    ```
    Valor total del inventario
    Costo: $45,678.90
    Venta: $78,234.50
    Ganancia potencial: $32,555.60 (71.2%)
    ```

    **Definición de Hecho:**
    - Cálculo correcto
    - Exclusión de productos sin precio
    - Formato monetario claro

    ---

    ## Módulo: Configuración

    ### HU-055: Configurar stock mínimo global por defecto

    **Como** usuario del sistema  
    **Quiero** establecer un stock mínimo por defecto  
    **Para** que todos los productos nuevos lo tengan

    **Criterios de Aceptación:**

    1. **DADO** que estoy en Configuración  
    **CUANDO** accedo a "Inventario"  
    **ENTONCES** veo campo "Stock mínimo por defecto"

    2. **DADO** que establezco un valor (ej: 5)  
    **CUANDO** creo un nuevo producto  
    **ENTONCES** el campo stock_min viene pre-llenado con 5

    3. **DADO** que cambio el default  
    **CUANDO** guardo  
    **ENTONCES** solo afecta a productos nuevos (no modifica existentes)

    **Definición de Hecho:**
    - Campo de configuración
    - Aplicación a nuevos productos
    - No afecta existentes

    ---

    ### HU-056: Configurar formato de visualización de precios

    **Como** usuario del sistema  
    **Quiero** elegir cómo se muestran los precios  
    **Para** adaptarlo a mi moneda/región

    **Criterios de Aceptación:**

    1. **DADO** que estoy en Configuración  
    **CUANDO** accedo a "Formato"  
    **ENTONCES** puedo configurar:
    - Símbolo de moneda (ej: $, €, USD)
    - Posición (antes/después del número)
    - Separador de miles (. , espacio)
    - Separador decimal (, .)
    - Decimales (0, 2)

    2. **DADO** que configuré el formato  
    **CUANDO** veo precios en la app  
    **ENTONCES** se muestran según mi configuración

    **Ejemplos:**
    - $1,234.56 (EE.UU.)
    - 1.234,56€ (Europa)
    - USD 1234.56

    **Definición de Hecho:**
    - Configuración flexible
    - Aplicación global
    - Presets regionales

    ---

    ### HU-057: Activar/desactivar notificaciones

    **Como** usuario del sistema  
    **Quiero** controlar qué notificaciones recibo  
    **Para** no ser interrumpido innecesariamente

    **Criterios de Aceptación:**

    1. **DADO** que estoy en Configuración → Notificaciones  
    **CUANDO** veo las opciones  
    **ENTONCES** puedo activar/desactivar (toggle):
    - Notificaciones de escaneo
    - Alertas de stock bajo
    - Sincronización completa
    - Errores de sincronización
    - Conflictos detectados

    2. **DADO** que desactivé una notificación  
    **CUANDO** ocurre el evento  
    **ENTONCES** NO recibo la notificación

    3. **DADO** que cambié configuración  
    **CUANDO** guardo  
    **ENTONCES** se aplica inmediatamente

    **Definición de Hecho:**
    - Toggles independientes
    - Aplicación inmediata
    - Sincronización entre dispositivos

    ---

    ### HU-058: Configurar tiempo de retención de productos escaneados

    **Como** usuario del sistema  
    **Quiero** configurar cuánto tiempo se guardan los productos escaneados  
    **Para** mantener la lista limpia automáticamente

    **Criterios de Aceptación:**

    1. **DADO** que estoy en Configuración  
    **CUANDO** accedo a "Productos escaneados"  
    **ENTONCES** puedo configurar:
    - Auto-eliminar después de: 7 / 30 / 90 días / Nunca
    - Solo eliminar vistos: Sí / No

    2. **DADO** que configuré auto-eliminación  
    **CUANDO** pasa el tiempo configurado  
    **ENTONCES** se borran automáticamente los scanned_items antiguos

    3. **DADO** que elegí "Solo vistos"  
    **CUANDO** se ejecuta la limpieza  
    **ENTONCES** solo se borran items con is_viewed = true

    **Definición de Hecho:**
    - Configuración de retención
    - Ejecución automática
    - Opción de filtrar por vistos

    ---

    ### HU-059: Ver información del dispositivo y sincronización

    **Como** usuario del sistema  
    **Quiero** ver información técnica de mi dispositivo  
    **Para** debugging o soporte

    **Criterios de Aceptación:**

    1. **DADO** que estoy en Configuración → Acerca de  
    **CUANDO** veo la información  
    **ENTONCES** se muestra:
    - Device ID único
    - Versión de la app
    - Plataforma (Web/Android/iOS)
    - Última sincronización exitosa
    - Tamaño de base de datos local
    - Cambios pendientes en queue

    2. **DADO** que presiono "Copiar información"  
    **CUANDO** confirmo  
    **ENTONCES** se copia todo como texto para compartir con soporte

    **Definición de Hecho:**
    - Info técnica completa
    - Opción de copiar
    - Útil para debugging

    ---

    ### HU-060: Realizar backup manual de datos locales

    **Como** usuario del sistema  
    **Quiero** hacer backup de mi base de datos local  
    **Para** tener una copia de seguridad

    **Criterios de Aceptación:**

    1. **DADO** que estoy en Configuración → Backup  
    **CUANDO** presiono "Crear backup"  
    **ENTONCES** se genera archivo JSON con toda la base local (productos, categorías, movimientos)

    2. **DADO** que se generó el backup  
    **CUANDO** confirmo descarga  
    **ENTONCES** se descarga archivo `backup_YYYY-MM-DD.json`

    3. **DADO** que tengo un archivo de backup  
    **CUANDO** presiono "Restaurar desde backup" y selecciono el archivo  
    **ENTONCES** se muestra warning "Esto sobrescribirá todos tus datos locales. ¿Continuar?"

    4. **DADO** que confirmé la restauración  
    **CUANDO** se procesa  
    **ENTONCES** se importan todos los datos del backup a la base local

    **Limitaciones:**
    - El backup es solo local (no incluye datos de otros dispositivos)
    - Restaurar sobrescribe TODO

    **Definición de Hecho:**
    - Exportación a JSON
    - Importación desde JSON
    - Confirmaciones de seguridad

    ---

    ## Módulo: Búsqueda y Filtros

    ### HU-061: Buscar producto por nombre

    **Como** usuario del sistema  
    **Quiero** buscar productos escribiendo su nombre  
    **Para** encontrarlos rápidamente

    **Criterios de Aceptación:**

    1. **DADO** que estoy en la lista de productos  
    **CUANDO** escribo en el campo de búsqueda  
    **ENTONCES** se filtran productos que contienen el texto en el nombre (case-insensitive, búsqueda parcial)

    2. **DADO** que escribí "coca"  
    **CUANDO** veo resultados  
    **ENTONCES** aparecen: "Coca Cola", "Coca Cola Light", "Coca Cola Zero"

    3. **DADO** que la búsqueda está activa  
    **CUANDO** borro el texto  
    **ENTONCES** vuelvo a ver todos los productos

    **Definición de Hecho:**
    - Búsqueda en tiempo real
    - Case-insensitive
    - Coincidencias parciales

    ---

    ### HU-062: Buscar producto por código de barras

    **Como** usuario del sistema  
    **Quiero** buscar productos por código de barras  
    **Para** encontrarlos sin recordar el nombre

    **Criterios de Aceptación:**

    1. **DADO** que escribo un código de barras en la búsqueda  
    **CUANDO** el texto es numérico y tiene 8-13 dígitos  
    **ENTONCES** busca por código de barras además de nombre

    2. **DADO** que escribí un código exacto  
    **CUANDO** hay match  
    **ENTONCES** muestra ese producto primero/destacado

    3. **DADO** que escribí código parcial  
    **CUANDO** hay coincidencias  
    **ENTONCES** muestra productos cuyos códigos empiezan con esos dígitos

    **Definición de Hecho:**
    - Búsqueda por código
    - Detección automática (numérico)
    - Coincidencias parciales

    ---

    ### HU-063: Filtrar productos por rango de precio

    **Como** usuario del sistema  
    **Quiero** filtrar productos por precio  
    **Para** ver solo productos en un rango

    **Criterios de Aceptación:**

    1. **DADO** que activo el filtro de precio  
    **CUANDO** establezco rango (ej: $100 - $500)  
    **ENTONCES** solo se muestran productos con price_sale en ese rango

    2. **DADO** que hay productos sin precio  
    **CUANDO** filtro por precio  
    **ENTONCES** esos productos NO aparecen en resultados

    3. **DADO** que establezco solo "mínimo" sin máximo  
    **CUANDO** filtro  
    **ENTONCES** muestra productos >= mínimo

    **Definición de Hecho:**
    - Filtro de rango
    - Exclusión de sin precio
    - Rangos abiertos

    ---

    ### HU-064: Filtrar productos por stock disponible

    **Como** usuario del sistema  
    **Quiero** filtrar productos por cantidad de stock  
    **Para** ver solo productos con stock o sin stock

    **Criterios de Aceptación:**

    1. **DADO** que activo filtro de stock  
    **CUANDO** selecciono opciones  
    **ENTONCES** puedo filtrar por:
    - Con stock (stock > 0)
    - Sin stock (stock = 0)
    - Stock bajo (stock <= stock_min)
    - Todos

    2. **DADO** que seleccioné "Sin stock"  
    **CUANDO** veo resultados  
    **ENTONCES** solo aparecen productos con stock_quantity = 0

    **Definición de Hecho:**
    - Filtro de stock
    - Múltiples opciones
    - Combinable con otros filtros

    ---

    ### HU-065: Ordenar productos por diferentes criterios

    **Como** usuario del sistema  
    **Quiero** ordenar la lista de productos  
    **Para** verlos según mis necesidades

    **Criterios de Aceptación:**

    1. **DADO** que estoy en la lista de productos  
    **CUANDO** selecciono criterio de orden  
    **ENTONCES** puedo ordenar por:
    - Nombre (A-Z / Z-A)
    - Precio (menor a mayor / mayor a menor)
    - Stock (menor a mayor / mayor a menor)
    - Fecha de creación (reciente / antigua)
    - Más escaneados

    2. **DADO** que cambio el orden  
    **CUANDO** selecciono otro criterio  
    **ENTONCES** la lista se reordena inmediatamente

    3. **DADO** que combiné orden + filtros  
    **CUANDO** veo resultados  
    **ENTONCES** primero filtra, luego ordena

    **Definición de Hecho:**
    - Múltiples criterios
    - Orden ascendente/descendente
    - Compatible con filtros

    ---

    ### HU-066: Guardar búsquedas/filtros favoritos

    **Como** usuario del sistema  
    **Quiero** guardar combinaciones de filtros  
    **Para** acceder rápido a vistas frecuentes

    **Criterios de Aceptación:**

    1. **DADO** que apliqué filtros y búsqueda  
    **CUANDO** presiono "Guardar como favorito"  
    **ENTONCES** puedo darle un nombre (ej: "Stock crítico - Bebidas")

    2. **DADO** que guardé un favorito  
    **CUANDO** accedo al menú de favoritos  
    **ENTONCES** veo lista de búsquedas guardadas

    3. **DADO** que selecciono un favorito  
    **CUANDO** lo aplico  
    **ENTONCES** se restauran todos los filtros y búsqueda guardados

    4. **DADO** que quiero editar/eliminar favorito  
    **CUANDO** presiono icono de editar/eliminar  
    **ENTONCES** puedo modificar nombre o eliminarlo

    **Definición de Hecho:**
    - Guardado de filtros
    - Nombre personalizado
    - Restauración completa
    - Edición/eliminación

    ---

    ## Módulo: Multi-dispositivo

    ### HU-067: Ver cambios de otros dispositivos en tiempo real

    **Como** usuario en un dispositivo  
    **Quiero** ver cambios hechos desde otros dispositivos inmediatamente  
    **Para** tener información actualizada

    **Criterios de Aceptación:**

    1. **DADO** que tengo el programa abierto en Dispositivo A  
    **CUANDO** Dispositivo B crea/edita/elimina un producto  
    **ENTONCES** el cambio aparece en Dispositivo A en menos de 2 segundos (gracias a Supabase Realtime)

    2. **DADO** que estoy viendo la lista de productos  
    **CUANDO** llega un cambio remoto  
    **ENTONCES** se actualiza la lista con animación sutil (no disruptiva)

    3. **DADO** que estoy editando un producto  
    **CUANDO** llega un cambio remoto del mismo producto  
    **ENTONCES** se muestra warning "Este producto fue modificado en otro dispositivo"

    **Definición de Hecho:**
    - Sincronización en tiempo real
    - Animaciones sutiles
    - Detección de edición concurrente

    ---

    ### HU-068: Identificar qué dispositivo hizo un cambio

    **Como** usuario del sistema  
    **Quiero** saber qué dispositivo modificó un producto  
    **Para** trazabilidad

    **Criterios de Aceptación:**

    1. **DADO** que veo el detalle de un producto  
    **CUANDO** observo metadata  
    **ENTONCES** veo "Última modificación por: [Dispositivo móvil Android] el [fecha]"

    2. **DADO** que veo el historial de movimientos  
    **CUANDO** observo cada entrada  
    **ENTONCES** veo icono y nombre del dispositivo que lo hizo

    3. **DADO** que veo conflictos  
    **CUANDO** observo las versiones  
    **ENTONCES** veo claramente "Tu versión (Web)" vs "Otra versión (Móvil iOS)"

    **Identificación de dispositivo:**
    - Nombre auto-generado: "Web", "Móvil Android", "Móvil iOS"
    - O nombre customizable por el usuario

    **Definición de Hecho:**
    - Tracking de device_id
    - Visualización clara
    - Nombres legibles

    ---

    ### HU-069: Ver lista de dispositivos sincronizados

    **Como** usuario del sistema  
    **Quiero** ver todos mis dispositivos conectados  
    **Para** administrarlos

    **Criterios de Aceptación:**

    1. **DADO** que estoy en Configuración → Dispositivos  
    **CUANDO** veo la lista  
    **ENTONCES** aparecen todos los dispositivos que han sincronizado, mostrando:
    - Nombre/tipo de dispositivo
    - Última sincronización
    - Estado (activo/inactivo)

    2. **DADO** que veo un dispositivo  
    **CUANDO** observo detalles  
    **ENTONCES** veo cuántos cambios ha hecho, cuándo se conectó por primera vez

    3. **DADO** que un dispositivo no sincronizó en 30+ días  
    **CUANDO** veo la lista  
    **ENTONCES** aparece marcado como "Inactivo"

    **Definición de Hecho:**
    - Lista de dispositivos
    - Metadata de actividad
    - Distinción activo/inactivo

    ---

    ### HU-070: Desvincular un dispositivo

    **Como** usuario del sistema  
    **Quiero** desvincular dispositivos que ya no uso  
    **Para** limpiar mi cuenta

    **Criterios de Aceptación:**

    1. **DADO** que estoy en la lista de dispositivos  
    **CUANDO** selecciono uno y presiono "Desvincular"  
    **ENTONCES** se muestra confirmación "Este dispositivo ya no podrá sincronizar. ¿Continuar?"

    2. **DADO** que confirmé  
    **CUANDO** se ejecuta  
    **ENTONCES** ese device_id se marca como revocado en Supabase

    3. **DADO** que desvinculé un dispositivo  
    **CUANDO** ese dispositivo intenta sincronizar  
    **ENTONCES** recibe error de autenticación y se le sugiere reconectar

    **Limitaciones:**
    - No puedes desvincular el dispositivo actual

    **Definición de Hecho:**
    - Revocación de device
    - Confirmación
    - Bloqueo de sync

    ---

    ## Módulo: Imágenes (Futuro)

    ### HU-071: Agregar foto a un producto

    **Como** usuario del sistema  
    **Quiero** subir una imagen de un producto  
    **Para** identificarlo visualmente

    **Criterios de Aceptación:**

    1. **DADO** que estoy editando un producto  
    **CUANDO** presiono "Agregar imagen"  
    **ENTONCES** puedo: (a) tomar foto con cámara, (b) seleccionar de galería, (c) ingresar URL

    2. **DADO** que seleccioné una imagen  
    **CUANDO** la subo  
    **ENTONCES** se guarda en Supabase Storage y se asocia al producto

    3. **DADO** que el producto tiene imagen  
    **CUANDO** veo el detalle  
    **ENTONCES** se muestra la imagen destacada

    **Limitaciones:**
    - Máximo 1 imagen por producto (v1)
    - Tamaño máximo: 5MB
    - Formatos: JPG, PNG, WEBP

    **Definición de Hecho:**
    - Upload a Supabase Storage
    - Compresión automática
    - Visualización en detalle

    ---

    ### HU-072: Tomar foto con cámara al escanear

    **Como** usuario de la app móvil  
    **Quiero** capturar la foto del producto mientras escaneo  
    **Para** registrarlo con imagen en un paso

    **Criterios de Aceptación:**

    1. **DADO** que escaneé un producto nuevo  
    **CUANDO** estoy creándolo  
    **ENTONCES** veo botón "Capturar imagen" que usa la misma cámara

    2. **DADO** que capturé la imagen  
    **CUANDO** guardo el producto  
    **ENTONCES** se sube junto con los datos

    **Definición de Hecho:**
    - Captura directa
    - Upload automático
    - UX fluido

    ---

    ### HU-073: Eliminar foto de un producto

    **Como** usuario del sistema  
    **Quiero** eliminar la imagen de un producto  
    **Para** quitarla si ya no es necesaria

    **Criterios de Aceptación:**

    1. **DADO** que un producto tiene imagen  
    **CUANDO** presiono "Eliminar imagen"  
    **ENTONCES** se borra de Supabase Storage y se desasocia del producto

    2. **DADO** que eliminé la imagen  
    **CUANDO** veo el producto  
    **ENTONCES** muestra placeholder genérico

    **Definición de Hecho:**
    - Eliminación de Storage
    - Actualización de producto

    ---

    ### HU-074: Ver galería de productos con imagen

    **Como** usuario del sistema  
    **Quiero** ver todos los productos en vista de galería  
    **Para** navegar visualmente

    **Criterios de Aceptación:**

    1. **DADO** que estoy en la lista de productos  
    **CUANDO** cambio a vista "Galería"  
    **ENTONCES** veo productos como grid de imágenes con nombre debajo

    2. **DADO** que un producto no tiene imagen  
    **CUANDO** está en galería  
    **ENTONCES** muestra icono genérico

    3. **DADO** que hago clic en una imagen  
    **CUANDO** navego  
    **ENTONCES** voy al detalle del producto

    **Definición de Hecho:**
    - Vista grid responsive
    - Fallback para sin imagen
    - Navegación funcional

    ---

    ## Módulo: Accesibilidad

    ### HU-075: Usar shortcuts de teclado en PC

    **Como** usuario del programa de escritorio  
    **Quiero** usar atajos de teclado  
    **Para** navegar más rápido

    **Criterios de Aceptación:**

    1. **DADO** que estoy en el programa de escritorio  
    **CUANDO** presiono atajos  
    **ENTONCES** funcionan:
    - Ctrl+K: Enfocar búsqueda
    - Ctrl+N: Nuevo producto
    - Ctrl+S: Guardar (al editar)
    - Esc: Cerrar modal/cancelar
    - Ctrl+Q: Cerrar programa (Windows/Linux)
    - Cmd+Q: Cerrar programa (Mac)
    - F11: Pantalla completa
    - ?: Ver lista de shortcuts

    2. **DADO** que presiono "?"  
    **CUANDO** se abre el modal  
    **ENTONCES** veo lista completa de atajos disponibles

    **Definición de Hecho:**
    - Shortcuts funcionales
    - Modal de ayuda
    - Atajos nativos de Electron
    - Compatible con cada sistema operativo

    ---

    ### HU-076: Navegar con lector de pantalla

    **Como** usuario con discapacidad visual  
    **Quiero** usar la app con lector de pantalla  
    **Para** acceder a todas las funciones

    **Criterios de Aceptación:**

    1. **DADO** que uso lector de pantalla  
    **CUANDO** navego por la app  
    **ENTONCES** todos los elementos tienen labels descriptivos (aria-label)

    2. **DADO** que hay imágenes  
    **CUANDO** el lector las encuentra  
    **ENTONCES** tienen alt text descriptivo

    3. **DADO** que hay formularios  
    **CUANDO** navego  
    **ENTONCES** los campos tienen labels asociados correctamente

    **Definición de Hecho:**
    - ARIA labels completos
    - Alt text en imágenes
    - Navegación por teclado funcional
    - Contraste adecuado

    ---

    ### HU-077: Modo oscuro/claro

    **Como** usuario del sistema  
    **Quiero** cambiar entre modo claro y oscuro  
    **Para** adaptar a mis preferencias/entorno

    **Criterios de Aceptación:**

    1. **DADO** que estoy en Configuración  
    **CUANDO** cambio el tema  
    **ENTONCES** puedo elegir: Claro / Oscuro / Auto (según sistema)

    2. **DADO** que seleccioné modo oscuro  
    **CUANDO** veo la app  
    **ENTONCES** todos los elementos usan colores oscuros

    3. **DADO** que seleccioné "Auto"  
    **CUANDO** el sistema cambia su tema  
    **ENTONCES** la app se adapta automáticamente

    **Definición de Hecho:**
    - Modo claro y oscuro completos
    - Opción auto basada en sistema
    - Transición suave

    ---

    ### HU-078: Ajustar tamaño de fuente

    **Como** usuario del sistema  
    **Quiero** aumentar/disminuir el tamaño de letra  
    **Para** leer más cómodamente

    **Criterios de Aceptación:**

    1. **DADO** que estoy en Configuración  
    **CUANDO** ajusto tamaño de fuente  
    **ENTONCES** puedo elegir: Pequeño / Normal / Grande / Extra grande

    2. **DADO** que cambié el tamaño  
    **CUANDO** veo la app  
    **ENTONCES** todo el texto se escala proporcionalmente

    **Definición de Hecho:**
    - Escalado proporcional
    - 4 tamaños disponibles
    - Se mantiene entre sesiones

    ---

    ## Módulo: Onboarding

    ### HU-079: Ver tutorial al usar la app por primera vez

    **Como** nuevo usuario  
    **Quiero** ver un tutorial  
    **Para** entender cómo usar la app

    **Criterios de Aceptación:**

    1. **DADO** que abro la app por primera vez  
    **CUANDO** cargo  
    **ENTONCES** se muestra tutorial interactivo (tour guiado) explicando:
    - Cómo escanear productos
    - Cómo crear productos
    - Pestaña de escaneados
    - Sincronización

    2. **DADO** que estoy en el tutorial  
    **CUANDO** navego  
    **ENTONCES** puedo avanzar, retroceder o saltar

    3. **DADO** que completé el tutorial  
    **CUANDO** termino  
    **ENTONCES** se marca como visto y no vuelve a aparecer

    4. **DADO** que quiero ver el tutorial de nuevo  
    **CUANDO** voy a Configuración → Ayuda  
    **ENTONCES** puedo reiniciarlo

    **Definición de Hecho:**
    - Tour interactivo (Intro.js o similar)
    - Pasos claros
    - Opción de saltar
    - Re-activable desde settings

    ---

    ### HU-080: Importar productos desde CSV al iniciar

    **Como** nuevo usuario con productos existentes  
    **Quiero** importar mi inventario desde CSV  
    **Para** no cargar todo manualmente

    **Criterios de Aceptación:**

    1. **DADO** que estoy en la primera carga  
    **CUANDO** presiono "Importar productos"  
    **ENTONCES** puedo seleccionar archivo CSV con formato:
    ```
    codigo_barras,nombre,descripcion,categoria,precio_costo,precio_venta,stock
    ```

    2. **DADO** que seleccioné el CSV  
    **CUANDO** lo proceso  
    **ENTONCES** se muestra preview con primeras 10 filas

    3. **DADO** que confirmé la importación  
    **CUANDO** se ejecuta  
    **ENTONCES** se crean todos los productos y se sincronizan

    4. **DADO** que hay errores en algunas filas  
    **CUANDO** termina la importación  
    **ENTONCES** se muestra reporte: "X productos importados, Y con errores" con detalle de errores

    **Validaciones:**
    - Headers obligatorios
    - Formato de datos
    - Códigos de barras únicos

    **Definición de Hecho:**
    - Importación masiva
    - Validación de datos
    - Reporte de errores
    - Sincronización post-import

    ---

    ### HU-081: Configurar primer producto de ejemplo

    **Como** nuevo usuario  
    **Quiero** ver un producto de ejemplo  
    **Para** entender cómo se ve

    **Criterios de Aceptación:**

    1. **DADO** que es mi primera vez en la app  
    **CUANDO** termino el tutorial  
    **ENTONCES** se crea automáticamente un producto de ejemplo:
    - Nombre: "Ejemplo: Coca Cola 500ml"
    - Con todos los campos llenos
    - Marcado como "Ejemplo" (se puede eliminar)

    2. **DADO** que veo el producto de ejemplo  
    **CUANDO** lo abro  
    **ENTONCES** hay tooltips explicando cada campo

    3. **DADO** que quiero eliminar el ejemplo  
    **CUANDO** lo borro  
    **ENTONCES** se elimina normalmente

    **Definición de Hecho:**
    - Producto de ejemplo creado
    - Tooltips explicativos
    - Eliminable

    ---

    ### HU-082: Conectar primer dispositivo

    **Como** nuevo usuario  
    **Quiero** conectar fácilmente mi primer dispositivo  
    **Para** empezar a sincronizar

    **Criterios de Aceptación:**

    1. **DADO** que instalo el programa por primera vez  
    **CUANDO** lo abro  
    **ENTONCES** se conecta automáticamente a Supabase con device_id único generado

    2. **DADO** que ya usé el programa en una PC  
    **CUANDO** instalo en otra PC o instalo la app móvil  
    **ENTONCES** puedo "vincular" usando código de emparejamiento de 6 dígitos

    3. **DADO** que vinculé dispositivos  
    **CUANDO** hago cambios  
    **ENTONCES** se sincronizan automáticamente

    **Vinculación:**
    - PC genera código de 6 dígitos
    - Móvil ingresa el código y se vincula a la misma cuenta
    - O viceversa: móvil genera, PC ingresa

    **Definición de Hecho:**
    - Conexión automática
    - Device ID único
    - Vinculación multi-dispositivo con código

    ---

    **Total: 82 Historias de Usuario**

    **Priorización sugerida para MVP:**
    - **Must have (P0)**: HU-001 a HU-009, HU-017 a HU-020, HU-024 a HU-026, HU-029 a HU-034, HU-036 a HU-042
    - **Should have (P1)**: HU-010 a HU-016, HU-021 a HU-023, HU-043 a HU-048, HU-049 a HU-054
    - **Nice to have (P2)**: HU-055 a HU-070, HU-079 a HU-082
    - **Future (P3)**: HU-071 a HU-078

    ---

    **Convenciones usadas:**
    - **DADO** = precondición
    - **CUANDO** = acción
    - **ENTONCES** = resultado esperado
    - * = campo obligatorio
    - → = flujo/secuencia
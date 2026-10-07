# Diferencias entre la app web y la de escritorio

Las dos versiones salen del mismo código (`src/renderer`). La web se publica sola al mergear a
`main` (Vercel); escritorio recién cuando se publica un release/tag. Lo que sigue funciona
distinto a propósito según la plataforma (se detecta con `window.electron`: existe solo en escritorio).

| Desde | Qué | Web | Escritorio |
| :--- | :--- | :--- | :--- |
| 2026-10-07 | Cámara como lector de códigos (`CameraScanButton`, `lib/cameraScanner.ts`): botón con ícono de cámara en Punto de Venta, Productos, Escáner, Catálogo Maestro, Remitos y en el código de barras de "Nuevo producto" | Solo desde el celular o tablet (pantalla táctil); en la web desde la compu no aparece. Pide permiso de cámara | No: se usa el lector físico, el botón no aparece |
| 2026-10-07 | Instalar como app (`manifest.webmanifest`, botón "Instalar app" en el menú) | El botón aparece solo desde el celular o tablet | No aplica (ya es una app instalada) |

Historial: del 2026-10-02 al 2026-10-05 las imágenes de producto (`ProductImagesField`) fueron solo web;
en la 1.3.5 se habilitaron también en escritorio.

Si en algún momento algo tiene que funcionar distinto según la plataforma, anotarlo en la tabla.
Para habilitar algo de la web en escritorio, sacar la condición correspondiente y publicar un release.

## Cambios que están en `main` pero todavía no llegaron a escritorio

Se publican con el próximo release de escritorio (no son diferencias permanentes). Hoy: ninguno
(el selector de proveedor y la baja lógica de productos salieron en la 1.3.5).

# Diferencias entre la app web y la de escritorio

Las dos versiones salen del mismo código (`src/renderer`). La web se publica sola al mergear a
`main` (Vercel); escritorio recién cuando se publica un release/tag. Lo que sigue funciona
distinto a propósito según la plataforma (se detecta con `window.electron`: existe solo en escritorio).

Hoy (desde la 1.3.5 de escritorio, 2026-10-05) **no hay diferencias**: web y escritorio hacen lo mismo.

| Desde | Qué | Web | Escritorio |
| :--- | :--- | :--- | :--- |
| — | (ninguna) | | |

Historial: del 2026-10-02 al 2026-10-05 las imágenes de producto (`ProductImagesField`) fueron solo web;
en la 1.3.5 se habilitaron también en escritorio.

Si en algún momento algo tiene que funcionar distinto según la plataforma, anotarlo en la tabla.
Para habilitar algo de la web en escritorio, sacar la condición correspondiente y publicar un release.

## Cambios que están en `main` pero todavía no llegaron a escritorio

Se publican con el próximo release de escritorio (no son diferencias permanentes). Hoy: ninguno
(el selector de proveedor y la baja lógica de productos salieron en la 1.3.5).

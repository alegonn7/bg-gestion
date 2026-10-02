# Diferencias entre la app web y la de escritorio

Las dos versiones salen del mismo código (`src/renderer`). La web se publica sola al mergear a
`main` (Vercel); escritorio recién cuando se publica un release/tag. Lo que sigue funciona
distinto a propósito según la plataforma (se detecta con `window.electron`: existe solo en escritorio).

| Desde | Qué | Web | Escritorio |
| :--- | :--- | :--- | :--- |
| 2026-10-02 | Imágenes de producto (las de bg-tienda) al crear/editar producto (`ProductImagesField`, `productImagesEnabled()`) | Sí | No |

Para habilitar algo de la web en escritorio, sacar la condición correspondiente y publicar un release.

## Cambios que están en `main` pero todavía no llegaron a escritorio

Se publican con el próximo release de escritorio (no son diferencias permanentes):

- 2026-10-02: selector de proveedor al crear producto.
- 2026-10-02: eliminar producto pasa a ser baja lógica (`is_active = false`); antes fallaba sin aviso en productos con ventas.

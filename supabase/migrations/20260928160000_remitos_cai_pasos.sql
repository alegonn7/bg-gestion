-- Pedido de CAI en pasos: el sistema busca (o crea) el punto de venta "Factuweb (Imprenta)" y
-- recién después pide el CAI. Hasta entonces el punto de venta y la numeración no se conocen.
ALTER TABLE remitos_cai ALTER COLUMN punto_venta DROP NOT NULL;
ALTER TABLE remitos_cai ALTER COLUMN desde DROP NOT NULL;
ALTER TABLE remitos_cai ALTER COLUMN hasta DROP NOT NULL;
ALTER TABLE remitos_cai
  ADD COLUMN IF NOT EXISTS paso     text,  -- puntos_venta | punto_venta | cai (mientras está pendiente)
  ADD COLUMN IF NOT EXISTS cantidad int;   -- remitos pedidos

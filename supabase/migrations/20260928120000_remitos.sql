-- Remitos: documento que acompaña la entrega o el traslado de mercadería.
-- 'X' = sin validez fiscal (documento no válido como factura); 'R' = con CAI de ARCA.

CREATE TABLE IF NOT EXISTS remitos (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id             uuid        REFERENCES branches(id) ON DELETE SET NULL,  -- sucursal que despacha
  tipo                  char(1)     NOT NULL DEFAULT 'X' CHECK (tipo IN ('X', 'R')),
  punto_venta           int         NOT NULL DEFAULT 1,
  numero                bigint      NOT NULL,                                     -- lo asigna remitos_numerar()
  fecha                 date        NOT NULL DEFAULT (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
  motivo                text        NOT NULL CHECK (motivo IN ('venta', 'traslado', 'devolucion', 'sin_cargo', 'otro')),
  sale_id               uuid        REFERENCES sales(id) ON DELETE SET NULL,
  destinatario_nombre   text,
  destinatario_doc_tipo int,                                                      -- 80 = CUIT, 96 = DNI
  destinatario_doc_nro  varchar(11),
  domicilio_entrega     text,
  sucursal_destino_id   uuid        REFERENCES branches(id) ON DELETE SET NULL,   -- traslados entre sucursales
  transportista         text,
  observaciones         text,
  items                 jsonb       NOT NULL,                                     -- [{ codigo, descripcion, cantidad }]
  estado                text        NOT NULL DEFAULT 'emitido' CHECK (estado IN ('emitido', 'anulado')),
  cai                   varchar(14),                                              -- solo remitos R
  cai_vence             date,
  created_by            uuid        REFERENCES users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, tipo, punto_venta, numero)
);

CREATE INDEX IF NOT EXISTS idx_remitos_org_fecha ON remitos (organization_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_remitos_sale ON remitos (sale_id);

-- Numeración correlativa por organización, tipo y punto de venta. El lock evita que dos
-- remitos simultáneos tomen el mismo número.
CREATE OR REPLACE FUNCTION public.remitos_numerar() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.organization_id::text || NEW.tipo || NEW.punto_venta::text));
  SELECT coalesce(max(r.numero), 0) + 1 INTO NEW.numero
    FROM public.remitos r
   WHERE r.organization_id = NEW.organization_id AND r.tipo = NEW.tipo AND r.punto_venta = NEW.punto_venta;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS remitos_numerar ON remitos;
CREATE TRIGGER remitos_numerar BEFORE INSERT ON remitos FOR EACH ROW EXECUTE FUNCTION public.remitos_numerar();

-- Cada organización ve y crea solo sus remitos; de un remito emitido solo se puede cambiar
-- el estado (anularlo)
ALTER TABLE remitos ENABLE ROW LEVEL SECURITY;
CREATE POLICY remitos_select ON remitos FOR SELECT
  USING (organization_id = (SELECT organization_id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY remitos_insert ON remitos FOR INSERT
  WITH CHECK (organization_id = (SELECT organization_id FROM users WHERE auth_id = auth.uid()));
CREATE POLICY remitos_update ON remitos FOR UPDATE
  USING (organization_id = (SELECT organization_id FROM users WHERE auth_id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM users WHERE auth_id = auth.uid()));
REVOKE UPDATE ON remitos FROM authenticated, anon;
GRANT UPDATE (estado) ON remitos TO authenticated;

-- Comprobantes fiscales: búsqueda por el código de venta que muestra la app (primeros 8 caracteres)
ALTER TABLE fiscal_comprobantes
  ADD COLUMN IF NOT EXISTS sale_ref text GENERATED ALWAYS AS (left(sale_id::text, 8)) STORED;
CREATE INDEX IF NOT EXISTS idx_fiscal_comprobantes_org_fecha ON fiscal_comprobantes (organization_id, fecha_emision DESC);

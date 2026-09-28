-- Remitos R: llevan un CAI (Código de Autorización de Impresión) que ARCA otorga para una
-- cantidad de números de un punto de venta, con vencimiento. Sin CAI vigente no hay remito R.
-- RG 1415 y RG 5678/2025 (el remito generado por sistema puede ser digital, pero con CAI).

CREATE TABLE IF NOT EXISTS remitos_cai (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  punto_venta       int         NOT NULL,
  cai               varchar(14),                 -- null mientras ARCA procesa la solicitud
  vencimiento       date,
  desde             bigint      NOT NULL,        -- rango de números autorizado
  hasta             bigint      NOT NULL,
  origen            text        NOT NULL CHECK (origen IN ('automatico', 'manual')),
  estado            text        NOT NULL DEFAULT 'vigente' CHECK (estado IN ('pendiente', 'vigente', 'error')),
  automatizacion_id text,
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (desde <= hasta)
);
CREATE INDEX IF NOT EXISTS idx_remitos_cai_org ON remitos_cai (organization_id, punto_venta);

-- La organización ve sus CAI; los carga y los pide solo el servidor (fiscal-setup)
ALTER TABLE remitos_cai ENABLE ROW LEVEL SECURITY;
CREATE POLICY remitos_cai_select ON remitos_cai FOR SELECT
  USING (organization_id = (SELECT organization_id FROM users WHERE auth_id = auth.uid()));

-- Numeración: el remito R toma el siguiente número dentro del rango de un CAI vigente y lleva
-- impreso ese CAI; si el CAI anterior venció o se agotó, salta al rango del siguiente
CREATE OR REPLACE FUNCTION public.remitos_numerar() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  siguiente    bigint;
  autorizacion public.remitos_cai%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.organization_id::text || NEW.tipo || NEW.punto_venta::text));
  SELECT coalesce(max(r.numero), 0) + 1 INTO siguiente
    FROM public.remitos r
   WHERE r.organization_id = NEW.organization_id AND r.tipo = NEW.tipo AND r.punto_venta = NEW.punto_venta;

  IF NEW.tipo = 'R' THEN
    SELECT c.* INTO autorizacion
      FROM public.remitos_cai c
     WHERE c.organization_id = NEW.organization_id
       AND c.punto_venta = NEW.punto_venta
       AND c.estado = 'vigente'
       AND c.hasta >= siguiente
       AND c.vencimiento >= NEW.fecha
     ORDER BY c.desde
     LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No hay un CAI vigente para el remito R N° % del punto de venta %. Pedí un CAI nuevo en Remitos.',
        siguiente, NEW.punto_venta;
    END IF;
    siguiente := greatest(siguiente, autorizacion.desde);
    NEW.cai := autorizacion.cai;
    NEW.cai_vence := autorizacion.vencimiento;
  END IF;

  NEW.numero := siguiente;
  RETURN NEW;
END $$;

-- Facturación electrónica con Afip SDK: cada organización factura con su propio certificado,
-- creado por Afip SDK con el CUIT y la clave fiscal del cliente. Reemplaza el esquema anterior
-- (certificado compartido del desarrollador + delegación en ARCA).

-- 1. Se elimina lo del esquema anterior
DROP TABLE IF EXISTS fiscal_wsaa_cache;
DROP TABLE IF EXISTS fiscal_contadores;

-- Las organizaciones configuradas con el esquema anterior tienen que hacer el alta nuevo
UPDATE organizations SET fiscal_enabled = false WHERE fiscal_enabled;

-- 2. Certificado de cada organización (encriptado con FISCAL_CERTS_ENCRYPTION_KEY)
CREATE TABLE IF NOT EXISTS fiscal_credentials (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  cuit            varchar(11) NOT NULL,
  ambiente        text        NOT NULL CHECK (ambiente IN ('dev', 'prod')),
  cert_alias      text,
  cert_encrypted  text,                  -- null solo con el CUIT de prueba de Afip SDK (dev)
  key_encrypted   text,
  activo          boolean     NOT NULL DEFAULT false, -- true cuando termina el alta
  ta_token        text,                  -- ticket de acceso de ARCA reutilizable (dura 12 hs)
  ta_sign         text,
  ta_expira       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
-- Sin policies: solo las Edge Functions (service role) acceden a los certificados
ALTER TABLE fiscal_credentials ENABLE ROW LEVEL SECURITY;

-- 3. Progreso del alta (automatizaciones de Afip SDK, una fila por organización)
CREATE TABLE IF NOT EXISTS fiscal_onboarding (
  organization_id   uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  cuit              varchar(11) NOT NULL,
  usuario           varchar(11) NOT NULL, -- CUIT/CUIL con el que se entra a ARCA
  ambiente          text        NOT NULL CHECK (ambiente IN ('dev', 'prod')),
  paso              text        NOT NULL, -- certificado | autorizacion | puntos_venta | punto_venta | listo
  estado            text        NOT NULL, -- en_curso | error | listo
  automatizacion_id text,
  cert_alias        text,
  punto_venta       int,
  error             text,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE fiscal_onboarding ENABLE ROW LEVEL SECURITY;

-- 4. Comprobantes de prueba (homologación) separados de los reales
ALTER TABLE fiscal_comprobantes ADD COLUMN IF NOT EXISTS ambiente text NOT NULL DEFAULT 'prod'
  CHECK (ambiente IN ('dev', 'prod'));
ALTER TABLE fiscal_comprobantes
  DROP CONSTRAINT IF EXISTS fiscal_comprobantes_organization_id_tipo_cbte_punto_venta_n_key;
ALTER TABLE fiscal_comprobantes
  ADD CONSTRAINT fiscal_comprobantes_numero_unico UNIQUE (organization_id, ambiente, tipo_cbte, punto_venta, numero);

-- 5. Los comprobantes solo los escribe el servidor (fiscal-emit); los usuarios solo los leen
DROP POLICY IF EXISTS "fiscal_comprobantes_org" ON fiscal_comprobantes;
CREATE POLICY "fiscal_comprobantes_org_select" ON fiscal_comprobantes
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );

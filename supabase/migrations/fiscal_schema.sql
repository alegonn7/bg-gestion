-- =====================================================
-- MIGRACIÓN: Módulo de Facturación Electrónica AFIP
-- Correr en Supabase SQL Editor
-- =====================================================

-- 1. Columnas fiscales en organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS fiscal_enabled       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cuit                 varchar(11),
  ADD COLUMN IF NOT EXISTS razon_social         text,
  ADD COLUMN IF NOT EXISTS condicion_iva        text DEFAULT 'CF',  -- 'RI', 'Monotributo', 'CF'
  ADD COLUMN IF NOT EXISTS punto_venta          int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS actividad_afip       bigint,             -- ej: 471120
  ADD COLUMN IF NOT EXISTS cert_pem_encrypted   text,              -- certificado público (encriptado)
  ADD COLUMN IF NOT EXISTS key_pem_encrypted    text,              -- clave privada (encriptada)
  ADD COLUMN IF NOT EXISTS cert_expires_at      date,              -- para alertar vencimiento
  ADD COLUMN IF NOT EXISTS wsaa_token           text,
  ADD COLUMN IF NOT EXISTS wsaa_sign            text,
  ADD COLUMN IF NOT EXISTS wsaa_token_expires   timestamptz;

-- 2. Correlatividad de comprobantes por organización
CREATE TABLE IF NOT EXISTS fiscal_contadores (
  organization_id   uuid REFERENCES organizations(id) ON DELETE CASCADE,
  tipo_cbte         int     NOT NULL,   -- 1=FactA, 6=FactB, 11=FactC, 91=Remito
  punto_venta       int     NOT NULL,
  ultimo_numero     bigint  DEFAULT 0,
  PRIMARY KEY (organization_id, tipo_cbte, punto_venta)
);

-- 3. Registro de comprobantes emitidos
CREATE TABLE IF NOT EXISTS fiscal_comprobantes (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid        REFERENCES organizations(id) ON DELETE CASCADE,
  sale_id           uuid        REFERENCES sales(id) ON DELETE SET NULL,
  tipo_cbte         int         NOT NULL,
  punto_venta       int         NOT NULL,
  numero            bigint      NOT NULL,
  fecha_emision     date        NOT NULL,
  cuit_receptor     varchar(11),
  razon_social_receptor text,
  condicion_iva_receptor int,           -- 1=RI, 5=CF, etc.
  importe_neto      decimal(15,2),
  importe_iva       decimal(15,2),
  importe_total     decimal(15,2),
  cae               varchar(14),
  cae_vence         date,
  resultado         char(1),            -- 'A'=Aprobado, 'O'=Observado, 'R'=Rechazado
  observaciones     jsonb,              -- mensajes de AFIP
  raw_request       jsonb,
  raw_response      jsonb,
  created_at        timestamptz DEFAULT now(),
  UNIQUE (organization_id, tipo_cbte, punto_venta, numero)
);

-- 4. RLS
ALTER TABLE fiscal_contadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_comprobantes ENABLE ROW LEVEL SECURITY;

-- Solo usuarios de la misma organización pueden ver/modificar
CREATE POLICY "fiscal_contadores_org" ON fiscal_contadores
  FOR ALL USING (
    organization_id = (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "fiscal_comprobantes_org" ON fiscal_comprobantes
  FOR ALL USING (
    organization_id = (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

-- 5. Columna alícuota IVA en products_branch (para facturación correcta por producto)
ALTER TABLE products_branch ADD COLUMN IF NOT EXISTS alicuota_iva int DEFAULT 5;
-- 3=Exento(0%), 4=10.5%, 5=21%, 6=27%

-- 6. Columna para Notas de Crédito (referencia al comprobante original)
ALTER TABLE fiscal_comprobantes ADD COLUMN IF NOT EXISTS original_comprobante_id uuid REFERENCES fiscal_comprobantes(id);

-- 7. Índices
CREATE INDEX IF NOT EXISTS idx_fiscal_comprobantes_org ON fiscal_comprobantes(organization_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_comprobantes_sale ON fiscal_comprobantes(sale_id);

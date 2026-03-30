-- Migración: modelo de certificado compartido (SaaS)
-- El certificado es del desarrollador, los clientes solo autorizan en ARCA

-- Cache del token WSAA compartido (una fila global)
CREATE TABLE IF NOT EXISTS fiscal_wsaa_cache (
  id int PRIMARY KEY DEFAULT 1,
  wsaa_token text,
  wsaa_sign text,
  wsaa_token_expires timestamptz,
  CHECK (id = 1)
);
INSERT INTO fiscal_wsaa_cache (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Eliminar columnas de certificado por organización (ya no se usan)
ALTER TABLE organizations
  DROP COLUMN IF EXISTS cert_pem_encrypted,
  DROP COLUMN IF EXISTS key_pem_encrypted,
  DROP COLUMN IF EXISTS cert_expires_at,
  DROP COLUMN IF EXISTS wsaa_token,
  DROP COLUMN IF EXISTS wsaa_sign,
  DROP COLUMN IF EXISTS wsaa_token_expires;

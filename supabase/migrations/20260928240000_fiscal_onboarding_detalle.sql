-- Detalle técnico de cada paso del alta (respuestas de ARCA/Afip SDK) para diagnosticar fallas.
-- No se le muestra al cliente.
ALTER TABLE fiscal_onboarding ADD COLUMN IF NOT EXISTS detalle jsonb NOT NULL DEFAULT '[]'::jsonb;

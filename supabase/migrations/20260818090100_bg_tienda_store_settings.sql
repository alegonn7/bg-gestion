-- =====================================================
-- MIGRACIÓN: bg-tienda — configuración de tienda online por organización
-- Correr en Supabase SQL Editor
-- =====================================================

CREATE TABLE IF NOT EXISTS store_settings (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id                 uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,  -- sucursal que vende online
  store_name                text,
  logo_url                  text,
  favicon_url               text,
  accent_color              text,
  whatsapp_number           text,
  whatsapp_message_template text,
  instagram_url             text,
  facebook_url              text,
  show_prices               boolean DEFAULT false,   -- default: "a confirmar", como el modelo actual de PinsCrew
  enabled                   boolean DEFAULT false,   -- flag "bg-tienda habilitado" para esta organización
  payment_online_enabled    boolean DEFAULT false,   -- reservado para checkout con pago online (fase futura)
  extra                     jsonb DEFAULT '{}',      -- flexibilidad futura sin migración, mismo idioma que plan_config.features
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

-- El slug público de la tienda reutiliza organizations.slug directamente (ya único, kebab-case,
-- gestionado en admin-gestion) — no se agrega un campo separado acá.

CREATE INDEX IF NOT EXISTS idx_store_settings_branch ON store_settings(branch_id);

ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;

-- Solo miembros de la organización pueden ver/gestionar su propia configuración de tienda.
-- El storefront público NO lee esta tabla directamente: usa las vistas públicas
-- (store_directory / store_catalog, ver migración de vistas) que exponen solo lo necesario.
CREATE POLICY "store_settings_org" ON store_settings
  FOR ALL USING (
    organization_id = (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

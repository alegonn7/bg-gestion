-- =====================================================
-- MIGRACIÓN: bg-tienda — banners del home de cada tienda
-- Correr en Supabase SQL Editor
-- =====================================================

CREATE TABLE IF NOT EXISTS hero_images (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url             text NOT NULL,
  position        int DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hero_images_org ON hero_images(organization_id);

ALTER TABLE hero_images ENABLE ROW LEVEL SECURITY;

-- Miembros de la organización gestionan sus propios banners.
CREATE POLICY "hero_images_org" ON hero_images
  FOR ALL USING (
    organization_id = (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

-- Lectura pública, pero solo de organizaciones con la tienda habilitada.
CREATE POLICY "hero_images_public_read" ON hero_images
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM store_settings WHERE enabled = true)
  );

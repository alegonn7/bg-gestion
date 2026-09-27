-- =====================================================
-- MIGRACIÓN: bg-tienda — tabla de talles (como categories, no texto libre)
-- Correr en Supabase SQL Editor
--
-- En la Fase 04 se dejó products.sizes como texto libre a propósito (bg-gestion no tenía tabla
-- de talles). En la práctica esto rompe el filtro de la tienda: dos productos con "25mm" y
-- "25 mm" no matchean entre sí. products.sizes sigue siendo text[] (un producto puede tener
-- varios talles, así que no es una FK simple como category_id) — lo que cambia es que ahora el
-- admin elige de una lista curada por organización en vez de tipear libre.
-- =====================================================

CREATE TABLE IF NOT EXISTS sizes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_sizes_org ON sizes(organization_id);

ALTER TABLE sizes ENABLE ROW LEVEL SECURITY;

-- Mismo patrón que categories: cualquiera del equipo ve la lista, solo owner/admin la edita.
CREATE POLICY "sizes_view_org" ON sizes
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "sizes_manage_org" ON sizes
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE auth_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

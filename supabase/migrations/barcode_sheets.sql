-- =====================================================
-- MIGRACIÓN: Hojas de códigos de barra
-- Correr en Supabase SQL Editor
-- =====================================================

CREATE TABLE IF NOT EXISTS public.barcode_sheets (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name            text NOT NULL,
  codes           text[] NOT NULL,
  size            text NOT NULL DEFAULT 'md',
  created_at      timestamp without time zone DEFAULT now(),
  CONSTRAINT barcode_sheets_pkey PRIMARY KEY (id),
  CONSTRAINT barcode_sheets_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE
);

ALTER TABLE public.barcode_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can manage their sheets"
  ON public.barcode_sheets
  FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users WHERE auth_id = auth.uid()
    )
  );

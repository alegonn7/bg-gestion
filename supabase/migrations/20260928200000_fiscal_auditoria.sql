-- Quién hizo cada cosa: se muestra en las listas (no en los PDF). El nombre se guarda como estaba
-- en ese momento, así el registro no cambia si después se renombra o se borra el usuario.

ALTER TABLE fiscal_comprobantes
  ADD COLUMN IF NOT EXISTS created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_name text;
CREATE INDEX IF NOT EXISTS idx_fiscal_comprobantes_created_by ON fiscal_comprobantes (created_by);

ALTER TABLE remitos
  ADD COLUMN IF NOT EXISTS created_by_name    text,
  ADD COLUMN IF NOT EXISTS anulado_por        uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS anulado_por_nombre text,
  ADD COLUMN IF NOT EXISTS anulado_en         timestamptz;
CREATE INDEX IF NOT EXISTS idx_remitos_anulado_por ON remitos (anulado_por);

ALTER TABLE remitos_cai
  ADD COLUMN IF NOT EXISTS created_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_name text;
CREATE INDEX IF NOT EXISTS idx_remitos_cai_created_by ON remitos_cai (created_by);

-- Remitos: quién lo hizo y quién lo anuló lo pone la base con la sesión del usuario, no la app
CREATE OR REPLACE FUNCTION public.remitos_auditar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  usuario_id     uuid;
  usuario_nombre text;
BEGIN
  SELECT u.id, coalesce(nullif(u.full_name, ''), u.email) INTO usuario_id, usuario_nombre
    FROM public.users u
   WHERE u.auth_id = (SELECT auth.uid());

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := coalesce(usuario_id, NEW.created_by);
    NEW.created_by_name := coalesce(usuario_nombre, NEW.created_by_name);
  ELSIF NEW.estado = 'anulado' AND OLD.estado <> 'anulado' THEN
    NEW.anulado_por := usuario_id;
    NEW.anulado_por_nombre := usuario_nombre;
    NEW.anulado_en := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS remitos_auditar ON remitos;
CREATE TRIGGER remitos_auditar BEFORE INSERT OR UPDATE ON remitos FOR EACH ROW EXECUTE FUNCTION public.remitos_auditar();

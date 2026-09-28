-- Soporte de plataforma (super admin): una cuenta del dueño de BG Gestión puede entrar a cualquier
-- organización para dar soporte. Cada acción queda registrada del lado del servidor y atribuida a
-- "Soporte" (el cliente no lo ve en la app). No es un usuario dentro de la organización del cliente:
-- es un permiso de plataforma, separado de la tabla users.
--
-- BASE (esta migración): las tablas y los helpers. Todavía NO habilita el acceso a las tablas del
-- negocio; eso va en una migración aparte que agrega, tabla por tabla, un permiso de solo para el
-- super admin sobre la organización que está soportando. Nada de esto se aplica en producción hasta
-- que el dueño lo pruebe en la rama.

-- 1. Quiénes son super admin de la plataforma
CREATE TABLE IF NOT EXISTS platform_admins (
  auth_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
-- Sin policies: solo las Edge Functions (service_role) lo administran.

-- 2. A qué organización está entrando ahora cada super admin. Se usa para acotar su acceso a esa
--    sola organización mientras da soporte (no a todas a la vez).
CREATE TABLE IF NOT EXISTS platform_admin_active_org (
  auth_id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  entered_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_admin_active_org ENABLE ROW LEVEL SECURITY;

-- 3. Registro de soporte: queda en el servidor. El cliente no lo ve en la app.
--    Es "solo agregar": ni el super admin puede editar o borrar lo que ya quedó registrado.
CREATE TABLE IF NOT EXISTS support_access_log (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_auth_id   uuid NOT NULL,
  admin_email     text NOT NULL,
  organization_id uuid,
  accion          text NOT NULL,       -- 'ingreso', 'crear', 'editar', 'borrar', ...
  detalle         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE support_access_log ENABLE ROW LEVEL SECURITY;
-- Sin policies de UPDATE/DELETE para nadie: el registro no se puede alterar desde la app.

-- 4. Helpers usados por las policies de las tablas del negocio (en la migración siguiente).

-- ¿La sesión actual es de un super admin de la plataforma?
CREATE OR REPLACE FUNCTION public.is_platform_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE auth_id = (SELECT auth.uid()))
$$;

-- La organización que el super admin está soportando ahora (null si no entró a ninguna).
CREATE OR REPLACE FUNCTION public.support_org_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT organization_id FROM public.platform_admin_active_org WHERE auth_id = (SELECT auth.uid())
$$;

REVOKE EXECUTE ON FUNCTION public.is_platform_admin() FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.support_org_id() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.support_org_id() TO authenticated;

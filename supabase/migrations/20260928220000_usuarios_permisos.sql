-- Usuarios: quién puede cambiar qué
--
-- 1) Un encargado (manager) puede editar y activar/desactivar a los empleados de su sucursal, como
--    ya ofrece la pantalla Usuarios (hasta ahora la base se lo impedía). No puede sacarlos de su
--    sucursal ni cambiarles el rol.
-- 2) Un encargado o un empleado, sobre su propio usuario, solo registra la fecha de su último
--    ingreso: la sucursal, el estado, el nombre y los permisos los cambia el dueño o un
--    administrador. Así nadie se reactiva a sí mismo ni se pasa de sucursal.

CREATE POLICY "Managers update branch employees" ON public.users
  FOR UPDATE
  USING (
    (SELECT get_auth_user_info.user_role FROM get_auth_user_info() get_auth_user_info(user_id, user_org_id, user_role, user_branch_id)) = 'manager'::user_role
    AND organization_id = (SELECT get_auth_user_info.user_org_id FROM get_auth_user_info() get_auth_user_info(user_id, user_org_id, user_role, user_branch_id))
    AND role = 'employee'::user_role
    AND branch_id = (SELECT get_auth_user_info.user_branch_id FROM get_auth_user_info() get_auth_user_info(user_id, user_org_id, user_role, user_branch_id))
  )
  WITH CHECK (
    organization_id = (SELECT get_auth_user_info.user_org_id FROM get_auth_user_info() get_auth_user_info(user_id, user_org_id, user_role, user_branch_id))
    AND role = 'employee'::user_role
    AND branch_id = (SELECT get_auth_user_info.user_branch_id FROM get_auth_user_info() get_auth_user_info(user_id, user_org_id, user_role, user_branch_id))
  );

CREATE OR REPLACE FUNCTION public.users_proteger_datos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Solo cuando alguien se edita a sí mismo desde la app (el servidor no tiene auth.uid())
  IF auth.uid() IS NULL OR OLD.auth_id IS DISTINCT FROM auth.uid() THEN
    RETURN NEW;
  END IF;

  IF (SELECT user_role FROM get_auth_user_info()) IN ('owner', 'admin') THEN
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'last_login_at' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'last_login_at' - 'updated_at') THEN
    RAISE EXCEPTION 'Estos datos los cambia el dueño desde Usuarios';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS users_proteger_datos ON public.users;
CREATE TRIGGER users_proteger_datos
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_proteger_datos();

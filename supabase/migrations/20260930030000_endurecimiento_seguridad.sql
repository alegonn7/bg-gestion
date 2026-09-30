-- Endurecimiento de seguridad (recomendaciones del analizador de Supabase).

-- 1. Fijar search_path en las funciones de límites de plan (evita que un search_path malicioso
--    cambie a qué tablas apuntan).
ALTER FUNCTION public.check_branch_limit() SET search_path = public;
ALTER FUNCTION public.check_branch_limit_update() SET search_path = public;
ALTER FUNCTION public.check_user_limit() SET search_path = public;
ALTER FUNCTION public.check_user_limit_update() SET search_path = public;
ALTER FUNCTION public.check_product_limit() SET search_path = public;
ALTER FUNCTION public.check_product_limit_update() SET search_path = public;

-- 2. Quitar la ejecución anónima. Las funciones reciben por defecto EXECUTE para PUBLIC (que
--    incluye al rol anónimo); revocarlo de PUBLIC y dar EXECUTE solo a quien corresponde.
REVOKE ALL ON FUNCTION public.remitos_auditar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remitos_auditar() TO authenticated;

REVOKE ALL ON FUNCTION public.process_pos_sale(uuid, uuid, numeric, numeric, numeric, text, numeric, numeric, numeric, uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_pos_sale(uuid, uuid, numeric, numeric, numeric, text, numeric, numeric, numeric, uuid, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.void_pos_sale(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_pos_sale(uuid) TO authenticated;

-- Nota: la "protección de contraseñas filtradas" (HaveIBeenPwned) es un ajuste de Auth que se
-- activa desde el panel de Supabase (Authentication → Policies), no por SQL.

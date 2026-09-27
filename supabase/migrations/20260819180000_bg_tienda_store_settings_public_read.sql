-- Bug: hero_images_public_read (Fase 01) filtra por
-- "organization_id IN (SELECT organization_id FROM store_settings WHERE enabled = true)".
-- Esa subquery corre con los permisos del rol que hace la consulta (a diferencia de una vista,
-- que corre con los permisos de su dueño) -- y store_settings solo tenía una policy
-- ("store_settings_org") que exige sesión. Para un visitante anónimo la subquery devolvía 0
-- filas siempre, así que el IN(...) daba false para todo: los banners nunca se veían sin login,
-- aunque la tienda estuviera habilitada. Se agrega una policy pública de solo lectura, acotada a
-- filas con enabled=true (mismo alcance que ya expone la vista store_directory).
CREATE POLICY "store_settings_public_read" ON store_settings
  FOR SELECT USING (enabled = true);

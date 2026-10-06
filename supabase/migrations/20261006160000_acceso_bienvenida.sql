-- Entrada directa al panel después de pagar. alta-tienda genera un código secreto que queda en el
-- navegador de quien hizo el alta (la landing) y guarda acá solo su hash. Con ese código,
-- estado-alta da UNA entrada al panel de BG Tienda sin pedir la contraseña, y nada más: se borra
-- al usarse y vence a las 24 horas. Sin el código (otro dispositivo, alguien que tiene el link de
-- bienvenida) se entra con email y contraseña como siempre.

ALTER TABLE platform_subscriptions
  ADD COLUMN IF NOT EXISTS acceso_hash text,
  ADD COLUMN IF NOT EXISTS acceso_vence_at timestamptz;

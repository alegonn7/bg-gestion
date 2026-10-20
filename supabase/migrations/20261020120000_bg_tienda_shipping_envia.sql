-- Envia.com como tercer "transportista" de BG Tienda: es un intermediario con registro propio
-- y gratuito (sin contrato ni ejecutivo comercial) que cotiza Andreani, Correo Argentino, OCA,
-- etc. con una sola clave de API. Las credenciales siguen en store_shipping_credentials como
-- JSON cifrado, así que solo hay que aceptar el valor nuevo en los tres CHECK.

ALTER TABLE store_shipping_credentials DROP CONSTRAINT IF EXISTS store_shipping_credentials_carrier_check;
ALTER TABLE store_shipping_credentials ADD CONSTRAINT store_shipping_credentials_carrier_check
  CHECK (carrier IN ('correo_argentino', 'andreani', 'envia'));

ALTER TABLE store_settings DROP CONSTRAINT IF EXISTS store_settings_shipping_carrier_check;
ALTER TABLE store_settings ADD CONSTRAINT store_settings_shipping_carrier_check
  CHECK (shipping_carrier IN ('correo_argentino', 'andreani', 'envia'));

ALTER TABLE store_orders DROP CONSTRAINT IF EXISTS store_orders_shipping_carrier_check;
ALTER TABLE store_orders ADD CONSTRAINT store_orders_shipping_carrier_check
  CHECK (shipping_carrier IN ('correo_argentino', 'andreani', 'envia'));

-- =====================================================
-- MIGRACIÓN: bg-tienda — aviso por mail al dueño de pedidos por WhatsApp/transferencia
--
-- aviso-pedido-nuevo marca acá cuándo ya avisó, para que cada pedido mande un solo mail aunque
-- alguien llame la función varias veces con el mismo id.
-- =====================================================

ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS owner_notified_at timestamptz;

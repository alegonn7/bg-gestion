-- =====================================================
-- MIGRACIÓN: bg-tienda — columnas de Mercado Pago en pedidos online
-- Correr en Supabase SQL Editor
-- =====================================================

-- Gap real: hasta ahora no había forma de encontrar la venta (sales) que confirm_store_order
-- generó para un pedido dado -- necesario para poder revertir stock en un reembolso.
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS sale_id uuid REFERENCES sales(id) ON DELETE SET NULL;

ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS mp_preference_id text;
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS mp_fee_amount numeric;
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS mp_refund_id text;
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS refunded_at timestamptz;
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS refunded_by uuid REFERENCES users(id);
ALTER TABLE store_orders ADD COLUMN IF NOT EXISTS refund_reason text;

-- Ampliar el estado del pedido con 'refunded'. Los pagos RECHAZADOS por Mercado Pago reusan
-- 'cancelled' + cancelled_reason (ya existe esa columna) en vez de sumar otro valor al enum --
-- menos churn de esquema, mismo resultado observable en /admin/pedidos.
--
-- Nombre de constraint: nace del CHECK inline sin nombre de la migración original
-- (20260818090300_bg_tienda_store_orders.sql), Postgres la nombra <tabla>_<columna>_check por
-- default -- confirmado que ninguna migración posterior le puso otro nombre. Si al correr esto
-- en producción el DROP falla, confirmar el nombre real con \d store_orders primero.
ALTER TABLE store_orders DROP CONSTRAINT IF EXISTS store_orders_status_check;
ALTER TABLE store_orders ADD CONSTRAINT store_orders_status_check
  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'refunded'));

-- Invariante real: el mismo pago de Mercado Pago nunca puede quedar asociado a dos pedidos.
CREATE UNIQUE INDEX IF NOT EXISTS idx_store_orders_mp_payment_id ON store_orders(mp_payment_id)
  WHERE mp_payment_id IS NOT NULL;

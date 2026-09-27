-- =====================================================
-- MIGRACIÓN: bg-tienda — pedidos online (pendiente -> confirmado -> stock)
-- Correr en Supabase SQL Editor
-- =====================================================

CREATE TABLE IF NOT EXISTS store_orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id         uuid NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,  -- copiado de store_settings.branch_id al momento del pedido
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  customer_name     text,
  customer_phone    text,
  customer_note     text,
  subtotal          numeric,
  total             numeric,
  payment_method    text DEFAULT 'whatsapp' CHECK (payment_method IN ('whatsapp', 'mercadopago')),
  mp_payment_id     text,   -- reservado, sin usar en v1
  mp_status         text,   -- reservado, sin usar en v1
  confirmed_by      uuid REFERENCES users(id),
  confirmed_at      timestamptz,
  cancelled_reason  text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_order_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_order_id uuid NOT NULL REFERENCES store_orders(id) ON DELETE CASCADE,
  product_id     uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name   text NOT NULL,   -- snapshot, sobrevive si se borra el producto
  size           text,
  quantity       int NOT NULL CHECK (quantity > 0),
  unit_price     numeric,         -- nullable: modelo "a confirmar" (ver store_settings.show_prices)
  subtotal       numeric
);

CREATE INDEX IF NOT EXISTS idx_store_orders_org ON store_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_store_orders_status ON store_orders(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_store_order_items_order ON store_order_items(store_order_id);

ALTER TABLE store_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_order_items ENABLE ROW LEVEL SECURITY;

-- Staff de la organización: ve y gestiona todos los pedidos de su tienda (listar, confirmar, cancelar).
CREATE POLICY "store_orders_org" ON store_orders
  FOR ALL USING (
    organization_id = (
      SELECT organization_id FROM users WHERE auth_id = auth.uid()
    )
  );

CREATE POLICY "store_order_items_org" ON store_order_items
  FOR ALL USING (
    store_order_id IN (
      SELECT id FROM store_orders WHERE organization_id = (
        SELECT organization_id FROM users WHERE auth_id = auth.uid()
      )
    )
  );

-- Clientes anónimos del storefront: solo pueden CREAR pedidos pendientes en tiendas habilitadas.
-- No pueden leer, editar ni confirmar ningún pedido (eso queda para el staff, policy de arriba).
CREATE POLICY "store_orders_public_insert" ON store_orders
  FOR INSERT WITH CHECK (
    status = 'pending'
    AND organization_id IN (SELECT organization_id FROM store_settings WHERE enabled = true)
  );

CREATE POLICY "store_order_items_public_insert" ON store_order_items
  FOR INSERT WITH CHECK (
    store_order_id IN (
      SELECT id FROM store_orders
      WHERE status = 'pending'
        AND organization_id IN (SELECT organization_id FROM store_settings WHERE enabled = true)
    )
  );

-- =====================================================
-- Compra automática de BG Tienda: el cliente se da de alta solo desde la landing, paga con una
-- suscripción de Mercado Pago a la cuenta de Binary Goats y la cuenta se activa sola.
-- Todo aditivo: las organizaciones existentes (plan enterprise) no cambian.
-- =====================================================

-- 1. Plan nuevo "tienda" ($10.000/mes, 1 sucursal). El primer mes se cobra al 50% desde la
--    Edge Function alta-tienda; acá vive solo el precio de lista.
INSERT INTO plan_config (plan_name, display_name, price_per_branch, max_branches, max_products_per_branch, max_users_per_branch, features, is_active)
VALUES ('tienda', 'BG Tienda', 10000, 1, 1000, 2, '{"soporte": "estandar"}'::jsonb, true)
ON CONFLICT (plan_name) DO NOTHING;

-- 2. Estados de suscripción. organizations.subscription_status no tiene CHECK: se suma "pending"
--    (alta creada, primer pago todavía no confirmado) a trial / active / past_due / suspended.

-- 3. Suscripción de la organización a Binary Goats (no confundir con store_mercadopago_credentials,
--    que es la cuenta de Mercado Pago de cada tienda para cobrarle a SUS compradores).
CREATE TABLE IF NOT EXISTS platform_subscriptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  product             text NOT NULL CHECK (product IN ('tienda')),
  plan                text NOT NULL,
  mp_preapproval_id   text UNIQUE,
  mp_status           text,                -- pending / authorized / paused / cancelled (de Mercado Pago)
  first_amount        numeric(12,2) NOT NULL,
  full_amount         numeric(12,2) NOT NULL,
  current_amount      numeric(12,2) NOT NULL,
  first_paid_at       timestamptz,
  last_paid_at        timestamptz,
  next_payment_date   timestamptz,
  past_due_since      timestamptz,
  cancelled_at        timestamptz,
  contact_name        text,
  contact_email       text,
  contact_phone       text,
  payer_email         text,                -- email de la cuenta de Mercado Pago, si es distinto
  last_synced_at      timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

-- Cada cobro mensual que informa Mercado Pago. La clave única hace idempotente el webhook: un
-- aviso repetido no registra (ni avisa por mail) dos veces el mismo cobro.
CREATE TABLE IF NOT EXISTS platform_payments (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id           uuid NOT NULL REFERENCES platform_subscriptions(id) ON DELETE CASCADE,
  mp_authorized_payment_id  text NOT NULL UNIQUE,
  mp_payment_id             text,
  amount                    numeric(12,2),
  status                    text NOT NULL,   -- approved / rejected / pending / ... (payment.status de MP)
  status_detail             text,
  debit_date                timestamptz,
  retry_attempt             integer,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_payments_org ON platform_payments(organization_id, debit_date DESC);

-- Intentos de alta por IP, para frenar a quien quiera crear cuentas en masa.
CREATE TABLE IF NOT EXISTS platform_signup_attempts (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip          text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_signup_attempts_ip ON platform_signup_attempts(ip, created_at DESC);

-- Solo lectura para el dueño y los administradores de la organización. Nadie escribe desde el
-- navegador: todo lo escriben las Edge Functions con la clave de servicio.
ALTER TABLE platform_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_signup_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_subscriptions_owner_read" ON platform_subscriptions
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE auth_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "platform_payments_owner_read" ON platform_payments
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE auth_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- 4. El dueño puede editar su organización (nombre, logo, datos fiscales), pero no su plan ni su
--    suscripción: antes la policy "Owners can update their organization" le dejaba cambiar
--    cualquier columna, incluido pasarse solo a enterprise o a "active" sin pagar. El panel
--    superadmin y las Edge Functions usan la clave de servicio (auth.uid() nulo) y no pasan por acá.
CREATE OR REPLACE FUNCTION public.organizations_proteger_suscripcion() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.trial_ends_at IS DISTINCT FROM OLD.trial_ends_at
     OR NEW.subscription_started_at IS DISTINCT FROM OLD.subscription_started_at
     OR NEW.subscription_ends_at IS DISTINCT FROM OLD.subscription_ends_at
     OR NEW.max_branches IS DISTINCT FROM OLD.max_branches
     OR NEW.max_products_per_branch IS DISTINCT FROM OLD.max_products_per_branch
     OR NEW.max_users_per_branch IS DISTINCT FROM OLD.max_users_per_branch
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
     OR NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'El plan y la suscripción los cambia Binary Goats';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS organizations_proteger_suscripcion ON organizations;
CREATE TRIGGER organizations_proteger_suscripcion
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.organizations_proteger_suscripcion();

-- 5. La tienda pública deja de verse si la cuenta todavía no pagó (pending) o está suspendida.
--    Mismas columnas que la versión anterior (20260922100000), solo cambia el WHERE.
CREATE OR REPLACE VIEW store_directory AS
SELECT
  o.id   AS organization_id,
  o.name AS organization_name,
  o.slug,
  s.branch_id,
  s.store_name,
  o.logo_url,
  s.favicon_url,
  s.accent_color,
  s.whatsapp_number,
  s.whatsapp_message_template,
  s.instagram_url,
  s.facebook_url,
  s.show_prices,
  s.payment_online_enabled,
  s.hero_title,
  s.hero_subtitle,
  s.features,
  s.logo_height,
  s.header_display,
  (s.payment_online_enabled AND EXISTS (
    SELECT 1 FROM store_mercadopago_credentials c WHERE c.organization_id = o.id
  )) AS mercadopago_available,
  s.shipping_enabled,
  s.shipping_carrier,
  s.whatsapp_orders_enabled,
  s.transfer_enabled,
  s.transfer_cbu,
  s.transfer_alias,
  s.transfer_receipt_email
FROM organizations o
JOIN store_settings s ON s.organization_id = o.id
WHERE s.enabled = true
  AND coalesce(o.subscription_status, 'active') NOT IN ('pending', 'suspended');

-- Lo mismo para el catálogo: sin esto los productos de una tienda suspendida seguirían saliendo
-- por la API pública aunque la página ya no exista.
CREATE OR REPLACE VIEW store_catalog AS
SELECT
  p.id AS product_id,
  p.organization_id,
  p.name,
  p.description,
  p.images,
  p.sizes,
  p.featured,
  c.name  AS category_name,
  c.color AS category_color,
  c.icon  AS category_icon,
  pb.id AS product_branch_id,
  pb.branch_id,
  pb.price_sale,
  pb.price_sale_usd,
  pb.stock_quantity,
  pb.alicuota_iva,
  p.created_at,
  pb.compare_at_price
FROM products p
JOIN products_branch pb ON pb.product_id = p.id
LEFT JOIN categories c ON c.id = p.category_id
JOIN store_settings s ON s.organization_id = p.organization_id AND s.branch_id = pb.branch_id
WHERE s.enabled = true
  AND p.is_active = true
  AND p.show_online = true
  AND pb.is_active = true
  AND pb.stock_quantity > 0
  AND EXISTS (
    SELECT 1 FROM organizations o
    WHERE o.id = p.organization_id
      AND coalesce(o.subscription_status, 'active') NOT IN ('pending', 'suspended')
  );

-- 6. Tareas automáticas (pg_cron ya está instalado: limpiar-scanned-items).

-- Suspende las cuentas de tienda que dejaron de pagar: canceladas cuyo mes pago ya venció, o
-- atrasadas hace más de 15 días (Mercado Pago reintenta durante ~10 días antes de rendirse).
CREATE OR REPLACE FUNCTION public.suspender_suscripciones_vencidas() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE organizations o
  SET subscription_status = 'suspended', updated_at = now()
  FROM platform_subscriptions ps
  WHERE ps.organization_id = o.id
    AND o.subscription_status IN ('active', 'past_due')
    AND (
      (o.subscription_ends_at IS NOT NULL AND o.subscription_ends_at < now())
      OR (o.subscription_status = 'past_due' AND ps.past_due_since < now() - interval '15 days')
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- Borra las altas que quedaron sin pagar más de 48 horas, para liberar el email y la dirección
-- de la tienda. Solo toca organizaciones creadas por el alta automática (con fila en
-- platform_subscriptions) y que nunca registraron un pago aprobado.
CREATE OR REPLACE FUNCTION public.limpiar_altas_sin_pagar() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_orgs uuid[];
  v_auth uuid[];
BEGIN
  SELECT array_agg(o.id) INTO v_orgs
  FROM organizations o
  JOIN platform_subscriptions ps ON ps.organization_id = o.id
  WHERE o.subscription_status = 'pending'
    AND ps.first_paid_at IS NULL
    AND ps.created_at < now() - interval '48 hours';

  IF v_orgs IS NULL THEN
    RETURN 0;
  END IF;

  SELECT array_agg(auth_id) INTO v_auth FROM users WHERE organization_id = ANY (v_orgs) AND auth_id IS NOT NULL;

  DELETE FROM store_settings WHERE organization_id = ANY (v_orgs);
  DELETE FROM organizations WHERE id = ANY (v_orgs);
  IF v_auth IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = ANY (v_auth);
  END IF;

  DELETE FROM platform_signup_attempts WHERE created_at < now() - interval '7 days';

  RETURN coalesce(array_length(v_orgs, 1), 0);
END $$;

REVOKE ALL ON FUNCTION public.suspender_suscripciones_vencidas() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.limpiar_altas_sin_pagar() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('suspender-suscripciones-vencidas', '15 * * * *', 'SELECT public.suspender_suscripciones_vencidas()');
SELECT cron.schedule('limpiar-altas-sin-pagar', '45 * * * *', 'SELECT public.limpiar_altas_sin_pagar()');

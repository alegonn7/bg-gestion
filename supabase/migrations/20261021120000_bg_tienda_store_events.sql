-- =====================================================
-- MIGRACIÓN: bg-tienda — estadísticas de la tienda (visitas, productos vistos, agregados al carrito)
--
-- La tienda pública registra eventos anónimos: cada navegador tiene un visitor_id al azar
-- (localStorage), sin datos personales. El dueño ve el resumen en /admin/estadisticas.
--
-- store_events no tiene ninguna policy: nadie la lee ni escribe directo. Se escribe solo con
-- track_store_event (anon, valida tienda habilitada y que el producto sea de esa tienda) y se lee
-- solo con store_stats, que saca la organización de la sesión (auth.uid()), nunca de un parámetro.
-- =====================================================

CREATE TABLE IF NOT EXISTS store_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('page_view', 'product_view', 'add_to_cart')),
  product_id uuid,
  quantity integer,
  visitor_id text NOT NULL CHECK (length(visitor_id) BETWEEN 8 AND 64),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS store_events_org_created_idx ON store_events (organization_id, created_at);

ALTER TABLE store_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION track_store_event(
  p_organization_id uuid,
  p_event_type text,
  p_visitor_id text,
  p_product_id uuid DEFAULT NULL,
  p_quantity integer DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_event_type NOT IN ('page_view', 'product_view', 'add_to_cart') THEN
    RETURN;
  END IF;
  IF p_visitor_id IS NULL OR length(p_visitor_id) NOT BETWEEN 8 AND 64 THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM store_settings WHERE organization_id = p_organization_id AND enabled = true) THEN
    RETURN;
  END IF;
  -- Un producto de otra organización (o inventado) no se registra.
  IF p_product_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id AND organization_id = p_organization_id) THEN
    RETURN;
  END IF;
  IF p_event_type IN ('product_view', 'add_to_cart') AND p_product_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO store_events (organization_id, event_type, product_id, quantity, visitor_id)
  VALUES (
    p_organization_id,
    p_event_type,
    p_product_id,
    CASE WHEN p_event_type = 'add_to_cart' THEN LEAST(GREATEST(COALESCE(p_quantity, 1), 1), 100) END,
    p_visitor_id
  );
END;
$$;

REVOKE ALL ON FUNCTION track_store_event(uuid, text, text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION track_store_event(uuid, text, text, uuid, integer) TO anon, authenticated;

-- Resumen de los últimos p_days días (1 a 90) de la organización del usuario logueado.
-- Los días se cuentan en hora de Argentina.
CREATE OR REPLACE FUNCTION store_stats(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org    uuid;
  v_days   integer := LEAST(GREATEST(COALESCE(p_days, 30), 1), 90);
  v_today  date := (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
  v_from   timestamptz;
  v_result jsonb;
BEGIN
  SELECT organization_id INTO v_org FROM users WHERE auth_id = auth.uid();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_from := ((v_today - (v_days - 1))::timestamp AT TIME ZONE 'America/Argentina/Buenos_Aires');

  WITH ev AS (
    SELECT * FROM store_events WHERE organization_id = v_org AND created_at >= v_from
  ),
  days AS (
    SELECT d::date AS day FROM generate_series(v_today - (v_days - 1), v_today, interval '1 day') d
  ),
  daily AS (
    SELECT
      days.day,
      COUNT(DISTINCT ev.visitor_id) AS visitors,
      COUNT(ev.id) FILTER (WHERE ev.event_type = 'page_view') AS page_views
    FROM days
    LEFT JOIN ev ON (ev.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date = days.day
    GROUP BY days.day
    ORDER BY days.day
  ),
  top_cart AS (
    SELECT ev.product_id, p.name, SUM(ev.quantity) AS units, COUNT(DISTINCT ev.visitor_id) AS visitors
    FROM ev JOIN products p ON p.id = ev.product_id
    WHERE ev.event_type = 'add_to_cart'
    GROUP BY ev.product_id, p.name
    ORDER BY units DESC, visitors DESC
    LIMIT 10
  ),
  top_viewed AS (
    SELECT ev.product_id, p.name, COUNT(*) AS views, COUNT(DISTINCT ev.visitor_id) AS visitors
    FROM ev JOIN products p ON p.id = ev.product_id
    WHERE ev.event_type = 'product_view'
    GROUP BY ev.product_id, p.name
    ORDER BY views DESC
    LIMIT 10
  )
  SELECT jsonb_build_object(
    'days', v_days,
    'visitors', (SELECT COUNT(DISTINCT visitor_id) FROM ev),
    'page_views', (SELECT COUNT(*) FROM ev WHERE event_type = 'page_view'),
    'cart_visitors', (SELECT COUNT(DISTINCT visitor_id) FROM ev WHERE event_type = 'add_to_cart'),
    'cart_units', (SELECT COALESCE(SUM(quantity), 0) FROM ev WHERE event_type = 'add_to_cart'),
    'orders', (
      SELECT COUNT(*) FROM store_orders
      WHERE organization_id = v_org AND created_at >= v_from AND status <> 'cancelled'
    ),
    'daily', COALESCE((SELECT jsonb_agg(jsonb_build_object('day', day, 'visitors', visitors, 'page_views', page_views)) FROM daily), '[]'::jsonb),
    'top_cart', COALESCE((SELECT jsonb_agg(to_jsonb(top_cart)) FROM top_cart), '[]'::jsonb),
    'top_viewed', COALESCE((SELECT jsonb_agg(to_jsonb(top_viewed)) FROM top_viewed), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION store_stats(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION store_stats(integer) TO authenticated;

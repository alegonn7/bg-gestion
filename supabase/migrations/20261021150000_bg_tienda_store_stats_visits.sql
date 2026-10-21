-- =====================================================
-- MIGRACIÓN: bg-tienda — store_stats también devuelve "visits" (visitas), además de los
-- visitantes únicos. Una visita nueva es un navegador que vuelve tras 30 minutos sin actividad.
-- =====================================================

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
    -- Visitas: cada vez que un navegador vuelve después de 30 minutos sin actividad cuenta como
    -- una visita nueva (el mismo criterio que usa Google Analytics para las sesiones).
    'visits', (
      SELECT COUNT(*) FROM (
        SELECT created_at - lag(created_at) OVER (PARTITION BY visitor_id ORDER BY created_at) AS gap
        FROM ev
      ) s
      WHERE gap IS NULL OR gap > interval '30 minutes'
    ),
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

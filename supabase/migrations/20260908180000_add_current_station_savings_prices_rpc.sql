-- Read-only mobile access to current station pricing. Direct table RLS remains unchanged.
CREATE OR REPLACE FUNCTION public.get_current_station_savings_prices(
  p_as_of date DEFAULT current_date
)
RETURNS TABLE (
  station_brand text,
  our_price_per_gallon numeric,
  effective_from date,
  effective_until date,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_as_of IS NULL THEN
    RAISE EXCEPTION 'p_as_of is required' USING ERRCODE = '22004';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.auth_user_id = auth.uid()
      AND profile.is_active IS TRUE
      AND profile.role::text IN ('driver', 'owner', 'general_manager')
  ) THEN
    RAISE EXCEPTION 'Active driver or manager profile required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (price.station_brand)
    price.station_brand::text,
    price.our_price_per_gallon,
    price.effective_from,
    price.effective_until,
    price.updated_at
  FROM public.station_savings_prices AS price
  WHERE price.effective_from <= p_as_of
    AND (price.effective_until IS NULL OR price.effective_until >= p_as_of)
  ORDER BY
    price.station_brand,
    price.effective_from DESC,
    price.updated_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_current_station_savings_prices(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_current_station_savings_prices(date) FROM anon;
REVOKE ALL ON FUNCTION public.get_current_station_savings_prices(date) FROM service_role;
GRANT EXECUTE ON FUNCTION public.get_current_station_savings_prices(date) TO authenticated;
COMMENT ON FUNCTION public.get_current_station_savings_prices(date) IS
  'Returns one current public pricing row per supported station brand to active drivers and managers.';

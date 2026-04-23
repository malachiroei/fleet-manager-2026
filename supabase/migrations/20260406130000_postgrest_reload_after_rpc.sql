-- =============================================================================
-- PostgREST keeps a schema cache. After CREATE/REPLACE of submit_mileage_report,
-- the API may return "Could not find the function ... in the schema cache" until reload.
-- =============================================================================

NOTIFY pgrst, 'reload schema';

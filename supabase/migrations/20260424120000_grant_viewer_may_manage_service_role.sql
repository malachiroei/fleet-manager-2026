-- Edge Function send-invite (service_role) קוראת ל-RPC לאימות הרשאת הזמנה.
GRANT EXECUTE ON FUNCTION public.viewer_may_manage_peer_profiles_in_org(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** ref של הפרויקט (לפני .supabase.co) — עדיף `VITE_*`; `NEXT_PUBLIC_*` לתאימות ישנה */
  readonly VITE_SUPABASE_PROJECT_REF?: string;
  readonly NEXT_PUBLIC_SUPABASE_PROJECT_REF?: string;
  /** `1` לדלג על בדיקת PROJECT_REF */
  readonly VITE_SUPABASE_SKIP_PROJECT_REF_CHECK?: string;
  readonly NEXT_PUBLIC_SUPABASE_SKIP_PROJECT_REF_CHECK?: string;
  /** @deprecated בלקוח — השתמש ב־VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY */
  readonly NEXT_PUBLIC_SUPABASE_URL?: string;
  readonly NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  readonly NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  /** v2.7.65: ref פרודקשן ידוע — fallback כשחסר NEXT_PUBLIC_SUPABASE_PROJECT_REF על דומיין פרו */
  readonly NEXT_PUBLIC_FLEET_KNOWN_PRODUCTION_SUPABASE_REF?: string;
  readonly VITE_FLEET_KNOWN_PRODUCTION_SUPABASE_REF?: string;
  readonly VITE_FLEET_PRODUCTION_SUPABASE_ANON_KEY?: string;
  /** @deprecated — השתמש ב־VITE_FLEET_PRODUCTION_SUPABASE_ANON_KEY */
  readonly NEXT_PUBLIC_FLEET_PRODUCTION_SUPABASE_ANON_KEY?: string;
  /** על fleet-manager-pro.com — לפני VITE_SUPABASE_URL */
  readonly VITE_FLEET_PRODUCTION_SUPABASE_URL?: string;
  readonly NEXT_PUBLIC_FLEET_PRODUCTION_SUPABASE_URL?: string;
  /** fallback ל-ref סטייג׳ כש-NEXT_PUBLIC_SUPABASE_PROJECT_REF לא מוגדר */
  readonly NEXT_PUBLIC_FLEET_STAGING_DEFAULT_SUPABASE_REF?: string;
  readonly VITE_FLEET_STAGING_DEFAULT_SUPABASE_REF?: string;
  /** profiles.id מופרדים בפסיק — חריג PermissionGuard כמו malachiroei@gmail.com */
  readonly VITE_FLEET_SUPER_ADMIN_USER_IDS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** מקור האמת ללקוח — חובה (סטייג׳ ופרודקשן עם ערכים שונים) */
  readonly NEXT_PUBLIC_SUPABASE_URL?: string;
  readonly NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  readonly NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  /** ref של הפרויקט (לפני .supabase.co) — לאימות בידוד מול URL */
  readonly NEXT_PUBLIC_SUPABASE_PROJECT_REF?: string;
  /** `1` לדלג על בדיקת PROJECT_REF (דומיין מותאם) */
  readonly NEXT_PUBLIC_SUPABASE_SKIP_PROJECT_REF_CHECK?: string;
  /** v2.7.65: ref פרודקשן ידוע — fallback כשחסר NEXT_PUBLIC_SUPABASE_PROJECT_REF על דומיין פרו */
  readonly NEXT_PUBLIC_FLEET_KNOWN_PRODUCTION_SUPABASE_REF?: string;
  readonly VITE_FLEET_KNOWN_PRODUCTION_SUPABASE_REF?: string;
  /** v2.7.66: anon לפרויקט ייצור (אופציונלי; אחרת NEXT_PUBLIC_SUPABASE_ANON_KEY) */
  readonly NEXT_PUBLIC_FLEET_PRODUCTION_SUPABASE_ANON_KEY?: string;
  readonly VITE_FLEET_PRODUCTION_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

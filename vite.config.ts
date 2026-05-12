import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

/**
 * PWA — vite-plugin-pwa:
 * - registerType: 'prompt' קבוע — בלי auto-inject של רישום
 * - injectRegister: null — אין הזרקת registerSW ל-index; רישום ידני ב-pwaPromptRegister.tsx בלבד
 */

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    /** `VITE_*` — מפתחות Supabase ללקוח; `NEXT_PUBLIC_*` — שאר דגלים (fleet guard וכו') ללא anon/url. */
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    base: '/',
    server: {
      host: "::",
      port: 8080,
      proxy: {
        '/api': 'http://localhost:3000',
      },
      hmr: {
        overlay: false,
      },
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: null,
        strategies: "injectManifest",
        srcDir: "src",
        // מקור TypeScript; vite-plugin-pwa יוצא ל-dist בשם sw-v2.js
        filename: "sw-v2.ts",
        manifest: false,
        includeManifestIcons: false,
        injectManifest: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: [
            "**/*.{js,css,html,ico,png,svg,webp,woff2,webmanifest}",
          ],
          globIgnores: ["**/node_modules/**/*", "**/v.json", "v.json"],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      assetsDir: 'assets',
      /** חובה hash בכתובת — בלי זה `assets/index.js` נשאר במטמון CDN/דפדפן/SW ואחרי דיפלוי נראית גרסה ישנה */
      rollupOptions: {
        output: {
          entryFileNames: "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
          manualChunks: (rawId) => {
            const id = String(rawId ?? '').replace(/\\/g, '/');
            if (!id.includes('/node_modules/')) return;
            if (id.includes('/node_modules/recharts/')) return 'recharts';
            if (id.includes('/node_modules/xlsx/')) return 'xlsx';
            if (id.includes('/node_modules/jspdf/')) return 'jspdf';
            return;
          },
        },
      },
    },
    define: {
      /** ISO של ריצת `vite build` — לתצוגת «עדכון אחרון» כשאין `last_update_date` במסד */
      __FLEET_APP_BUILD_ISO__: JSON.stringify(new Date().toISOString()),
      // הזרקה מפורשת של משתני הסביבה כדי למנוע Cache
      'process.env.VITE_APP_STATUS': JSON.stringify(env.VITE_APP_STATUS),
      'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL ?? ''),
      'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ''),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
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
    /** Expose both Vite and NEXT_PUBLIC_* names (Vercel env often uses the latter). */
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
      rollupOptions: {
        output: {
          entryFileNames: "assets/[name].js",
          chunkFileNames: "assets/[name].js",
          assetFileNames: "assets/[name][extname]",
        },
      },
    },
    define: {
      // הזרקה מפורשת של משתני הסביבה כדי למנוע Cache
      'process.env.VITE_APP_STATUS': JSON.stringify(env.VITE_APP_STATUS),
      'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(
        env.NEXT_PUBLIC_SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? ''
      ),
      'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? ''
      ),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
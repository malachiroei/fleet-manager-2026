import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

/**
 * PWA — vite-plugin-pwa:
 * - registerType: 'prompt' (לא autoUpdate) — לא מפעילים גרסת SW חדשה בלי אישור מהממשק
 * - strategies: 'injectManifest' — מקור: src/sw.ts (ללא skipWaiting ב-install)
 * - injectRegister: false — הרישום ב-src/lib/pwaPromptRegister.tsx (עם הפרדת prod/test)
 */

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // טעינת משתני הסביבה לפי המוד הנוכחי
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
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
        registerType: "prompt",
        injectRegister: false,
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        manifest: false,
        includeManifestIcons: false,
        injectManifest: {
          globPatterns: [
            "**/*.{js,css,html,ico,png,svg,webp,woff2,json,webmanifest}",
          ],
          globIgnores: ["**/node_modules/**/*"],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    build: {
      outDir: 'dist',
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
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

/**
 * PWA — vite-plugin-pwa:
 * - פלט SW בדפדפן: /sw-v2.js (מקור לבילד: src/sw-v2.ts) — שובר רישום ישן של sw.js
 * - registerType: מ-VITE_PWA_REGISTER_TYPE — autoUpdate (טסט) / prompt (ייצור). ברירת מחדל: prompt
 * - injectRegister: false — הרישום ב-src/lib/pwaPromptRegister.tsx
 *
 * אם build של ה-SW נכשל עם MODULE_NOT_FOUND ב־@babel/* — ודאו ש־devDependencies כוללות
 * @babel/traverse ו־@babel/generator תקינים (workbox-build משתמש בהם).
 */

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // טעינת משתני הסביבה לפי המוד הנוכחי
  const env = loadEnv(mode, process.cwd(), '');
  const pwaRegisterType =
    env.VITE_PWA_REGISTER_TYPE === 'autoUpdate' ? ('autoUpdate' as const) : ('prompt' as const);

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
        registerType: pwaRegisterType,
        injectRegister: false,
        strategies: "injectManifest",
        srcDir: "src",
        // מקור TypeScript; vite-plugin-pwa יוצא ל-dist בשם sw-v2.js
        filename: "sw-v2.ts",
        manifest: false,
        includeManifestIcons: false,
        injectManifest: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: [
            "**/*.{js,css,html,ico,png,svg,webp,woff2,json,webmanifest}",
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
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// vite-plugin-pwa עם workbox נכשל כאן (babel traverse חסר). שקול ל־registerType "prompt": public/sw.js + src/lib/pwaPromptRegister.tsx

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
    plugins: [react()],
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
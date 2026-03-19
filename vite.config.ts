import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // טעינת משתני הסביבה לפי המוד הנוכחי
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    // ב-production: כל ה-scriptים וה-styles ב-index נטענים עם URL מלא לשרת הטסט (Vite base).
    // ב-dev נשאר '/' כדי ש־npm run dev ימשיך לעבוד מקומית.
    base: mode === 'production' ? 'https://fleet-manager-dev.vercel.app/' : '/',
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
      rollupOptions: {
        output: {
          entryFileNames: "assets/[name]-orange-[hash].js",
          chunkFileNames: "assets/[name]-orange-[hash].js",
          assetFileNames: "assets/[name]-orange-[hash][extname]",
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
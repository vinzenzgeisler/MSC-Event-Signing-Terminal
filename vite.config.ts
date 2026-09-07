import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.VITE_API_PROXY_TARGET;

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "prompt",
        injectRegister: false,
        pwaAssets: {
          image: "public/msc-logo.png",
          preset: "minimal-2023"
        },
        manifest: {
          id: "/",
          name: "MSC Event Signing Terminal",
          short_name: "MSC Terminal",
          description: "Terminal für die digitale Unterschrift bei MSC-Veranstaltungen",
          lang: "de",
          start_url: "/",
          scope: "/",
          display: "standalone",
          background_color: "#eef2f7",
          theme_color: "#0d2548"
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2,webmanifest}"],
          cleanupOutdatedCaches: true,
          navigateFallbackDenylist: [/^\/api(?:\/|$)/, /^\/terminal(?:\/|$)/]
        }
      })
    ],
    server: {
      port: 5178,
      host: "0.0.0.0",
      ...(proxyTarget
        ? {
            proxy: {
              "/api": {
                target: proxyTarget,
                changeOrigin: true,
                secure: true,
                rewrite: (path) => path.replace(/^\/api/, "")
              }
            }
          }
        : {})
    }
  };
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

// Dark-green brand colour drives the PWA theme + install splash.
const BRAND_GREEN = "#14532d";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Nnewi North PHC Digital Health Platform",
        short_name: "PHC-Track",
        description:
          "Offline-first digital health records for Primary Health Centres in Nnewi North LGA.",
        theme_color: BRAND_GREEN,
        background_color: BRAND_GREEN,
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
          { src: "icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
          {
            src: "icon-512.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // App-shell precache so the UI loads with no network (phase-0 §3).
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallback: "index.html",
      },
    }),
  ],
  resolve: {
    alias: {
      // Consume packages/shared directly (no separate build step) — keeps
      // client/server types from drifting (phase-0 acceptance).
      "@phc/shared": fileURLToPath(
        new URL("../../packages/shared/src/index.ts", import.meta.url),
      ),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});

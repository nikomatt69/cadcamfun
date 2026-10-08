import { defineConfig } from "vite"
import solid from "vite-plugin-solid"

// Fixed port: `devUrl` of the Tauri iOS project (src-tauri/tauri.conf.json, created by `tauri ios init`) points at it.
export default defineConfig({
  plugins: [solid()],
  clearScreen: false,
  // `tauri ios dev` on a physical device sets TAURI_DEV_HOST to the Mac's LAN address.
  server: {
    port: 1421,
    strictPort: true,
    host: process.env.TAURI_DEV_HOST || "localhost",
    hmr: process.env.TAURI_DEV_HOST ? { protocol: "ws", host: process.env.TAURI_DEV_HOST, port: 1422 } : undefined
  },
  build: { outDir: "dist", target: "es2022", sourcemap: true }
})

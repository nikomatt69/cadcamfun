import { defineConfig } from "vite"
import solid from "vite-plugin-solid"

// Fixed port: `devUrl` in src-tauri/tauri.conf.json points at it.
export default defineConfig({
  plugins: [solid()],
  clearScreen: false,
  // Fonts, cursors and icons are shared with the legacy app and live in the repo-root public/ folder.
  publicDir: "../../public",
  server: { port: 1420, strictPort: true, host: "localhost" },
  build: { outDir: "dist", target: "es2022", sourcemap: true }
})

import { defineConfig } from "vite"
import solid from "vite-plugin-solid"

// Fixed port: `devUrl` of the Tauri iOS project (src-tauri/tauri.conf.json, created by `tauri ios init`) points at it.
export default defineConfig({
  plugins: [solid()],
  clearScreen: false,
  server: { port: 1421, strictPort: true, host: true },
  build: { outDir: "dist", target: "es2022", sourcemap: true }
})

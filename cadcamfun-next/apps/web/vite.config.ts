import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import solid from "vite-plugin-solid"

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/api": { target: process.env.CADCAMFUN_API ?? "http://localhost:8787", changeOrigin: true } },
  },
  build: { target: "es2023", chunkSizeWarningLimit: 700 },
})

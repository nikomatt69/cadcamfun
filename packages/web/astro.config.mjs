import { defineConfig } from "astro/config"
import cloudflare from "@astrojs/cloudflare"
import mdx from "@astrojs/mdx"
import tailwind from "@astrojs/tailwind"

export default defineConfig({
  site: "https://cadcam.fun",
  output: "server",
  // Local dev never opens a remote Cloudflare session: Workers AI (the docs
  // assistant) needs a wrangler login, so in dev the assistant answers 503
  // unless a nikcli backend is configured. Deployed Workers get the binding.
  adapter: cloudflare({ platformProxy: { enabled: true, remoteBindings: false } }),
  integrations: [tailwind(), mdx()],
  vite: {
    define: {
      global: "globalThis",
    },
    server: {
      proxy: {
        "/studio/api": { target: "http://127.0.0.1:4396", changeOrigin: true },
      },
    },
  },
})

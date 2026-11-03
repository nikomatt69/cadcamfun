import { defineConfig } from "astro/config"
import cloudflare from "@astrojs/cloudflare"
import mdx from "@astrojs/mdx"
import tailwind from "@astrojs/tailwind"
import react from "@astrojs/react"
import { gzipSync } from "node:zlib"
import { readFileSync } from "node:fs"

// Keep translation dictionaries compact in the Worker upload. Vite's JSON
// transform otherwise expands the entire catalog into a large JS object.
const compressedCatalogs = {
  name: "compressed-server-catalogs",
  enforce: "pre",
  resolveId(source, importer, options) {
    if (!options?.ssr || !importer?.endsWith("/src/i18n/catalog.ts") || !/^\.\/catalog\/(?:ar|de|es|fr|hi|it|ja|pt|ru|zh-CN)\.json$/.test(source)) return
    return `\0compressed-catalog:${source.slice("./catalog/".length)}.js`
  },
  load(id) {
    if (!id.startsWith("\0compressed-catalog:")) return
    const filename = id.slice("\0compressed-catalog:".length, -3)
    const code = readFileSync(new URL(`./src/i18n/catalog/${filename}`, import.meta.url))
    const compressed = gzipSync(code, { level: 9 }).toString("base64")
    return {
      code: `import { gunzipSync } from "node:zlib"; import { Buffer } from "node:buffer"; export default JSON.parse(gunzipSync(Buffer.from(${JSON.stringify(compressed)}, "base64")).toString("utf8"));`,
      map: null,
    }
  },
}

export default defineConfig({
  site: "https://cadcam.fun",
  output: "server",
  // Local dev never opens a remote Cloudflare session: Workers AI (the docs
  // assistant) needs a wrangler login, so in dev the assistant answers 503
  // unless a nikcli backend is configured. Deployed Workers get the binding.
  adapter: cloudflare({ platformProxy: { enabled: true, remoteBindings: false } }),
  integrations: [tailwind(), mdx(), react()],
  vite: {
    plugins: [compressedCatalogs],
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

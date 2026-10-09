import { defineConfig } from "vite"
import solid from "vite-plugin-solid"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

const require = createRequire(import.meta.url)

// Fixed port: `devUrl` in src-tauri/tauri.conf.json points at it.
export default defineConfig({
  plugins: [solid(), {
    name: "cad-decoder-licenses",
    generateBundle() {
      const dist = dirname(require.resolve("occt-import-js"))
      for (const name of ["license.occt.txt", "license.occt-import-js.txt"]) this.emitFile({ type: "asset", fileName: `licenses/${name}`, source: readFileSync(join(dist, name), "utf8") })
      this.emitFile({ type: "asset", fileName: "licenses/cad-decoder-notice.txt", source: "CAD file decoding uses the unmodified occt-import-js 0.0.23 OpenCascade WebAssembly module, distributed as a separate runtime asset. Source and build instructions: https://github.com/kovacsv/occt-import-js . See license.occt.txt and license.occt-import-js.txt for license terms.\n" })
    }
  }],
  clearScreen: false,
  // Fonts, cursors and icons are shared with the legacy app and live in the repo-root public/ folder.
  publicDir: "../../public",
  server: { port: 1420, strictPort: true, host: "localhost" },
  build: { outDir: "dist", target: "es2022", sourcemap: true }
})

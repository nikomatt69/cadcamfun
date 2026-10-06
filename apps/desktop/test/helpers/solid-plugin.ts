/**
 * Lets `bun test` load the Solid UI without a browser or Vite (registered through the root
 * `bunfig.toml` preload):
 *
 *  - `.tsx` files under `apps/desktop/src` go through Babel with the preset `vite-plugin-solid`
 *    uses;
 *  - every import of `solid-js`, `solid-js/web` and `solid-js/store` is rewritten to the
 *    browser (DOM) build. Bun's runtime `onResolve` does not fire for these bare specifiers
 *    and Bun would otherwise pick the server build, in which `render`, `template` and friends
 *    throw "Client-only API called on the server side". Rewriting at load time also covers the
 *    UI libraries (lucide-solid, @solidjs/router, kobalte) so the whole app shares one copy
 *    of Solid's reactive core.
 */
import { transformSync } from "@babel/core"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

const require = createRequire(join(import.meta.dir, "../../package.json"))
const solidRoot = dirname(require.resolve("solid-js/package.json"))
const browserBuilds: Record<string, string> = {
  // Motion One's CommonJS/ESM mix does not load under bun; animations are irrelevant without a browser.
  "solid-motionone": join(import.meta.dir, "solid-motionone-stub.ts"),
  "solid-js": join(solidRoot, "dist/solid.js"),
  "solid-js/web": join(solidRoot, "web/dist/web.js"),
  "solid-js/store": join(solidRoot, "store/dist/store.js")
}
const SRC = join(import.meta.dir, "../../src")
const SOLID_IMPORT = /((?:from|import)\s*\(?\s*)(["'])(solid-js(?:\/web|\/store)?|solid-motionone)\2/g
const useBrowserBuild = (code: string): string =>
  code.replace(SOLID_IMPORT, (_all, head: string, quote: string, name: string) => `${head}${quote}${browserBuilds[name]}${quote}`)

Bun.plugin({
  name: "solid-dom",
  setup(build) {
    // Plugin loaders must return contents; files that need no change are handed back as they are.
    build.onLoad({ filter: /\.tsx$/ }, (args) => {
      const text = readFileSync(args.path, "utf8")
      if (!args.path.startsWith(SRC)) return { contents: text, loader: "tsx" }
      const result = transformSync(text, {
        presets: [
          [require.resolve("babel-preset-solid"), { generate: "dom", hydratable: false }],
          [require.resolve("@babel/preset-typescript"), { isTSX: true, allExtensions: true }]
        ],
        filename: args.path, babelrc: false, configFile: false, sourceMaps: "inline"
      })
      return { contents: useBrowserBuild(result?.code ?? ""), loader: "js" }
    })
    // Source `.ts` files and the Solid libraries in node_modules that import Solid directly.
    build.onLoad({ filter: /(\/apps\/desktop\/(src|test)\/.*\.ts|node_modules\/(\.bun\/[^/]+\/node_modules\/)?(solid-js|lucide-solid|@solidjs|@kobalte|solid-motionone|@motionone|@solid-primitives)\/.*\.m?js)$/ }, (args) => {
      const text = readFileSync(args.path, "utf8")
      const ts = args.path.endsWith(".ts") && !args.path.endsWith(".d.ts")
      return { contents: useBrowserBuild(text), loader: ts ? "ts" : "js" }
    })
  }
})

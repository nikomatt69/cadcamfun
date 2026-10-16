import { expect, test } from "bun:test"

test("the native sidecar boots with all action contributions and serves project MCP configuration", async () => {
  const child = Bun.spawn([process.execPath, "--no-env-file", new URL("./fixtures/ai-extensions-native-probe.ts", import.meta.url).pathname], { stdout: "pipe", stderr: "pipe" })
  const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect(code, err.slice(-1500) + out.slice(-1500)).toBe(0)
  expect(out).toContain("NATIVE_EXTENSIONS_PASS")
}, 120000)

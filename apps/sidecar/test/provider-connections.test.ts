import { expect, test } from "bun:test"

test("native provider connections: OpenAI/xAI OAuth and OpenCode Zen/Go account keys", async () => {
  const child = Bun.spawn([process.execPath, "--no-env-file", new URL("./fixtures/provider-connections-probe.ts", import.meta.url).pathname], { stdout: "pipe", stderr: "pipe" })
  const timer = setTimeout(() => child.kill(), 100_000)
  try {
    const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    expect(code, err.slice(-2500) + out.slice(-2500)).toBe(0)
    expect(out).toContain("PROVIDER_CONNECTIONS_PASS")
    expect(out).not.toContain("fixture-access")
    expect(out).not.toContain("fixture-refresh")
  } finally { clearTimeout(timer); child.kill() }
}, 110_000)

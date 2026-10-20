import { expect, test } from "bun:test"

test("a fresh profile loads the full catalogue before its first host, refreshes live and preserves sessions on failure", async () => {
  const child = Bun.spawn([process.execPath, "--no-env-file", new URL("./fixtures/catalogue-refresh-probe.ts", import.meta.url).pathname], { stdout: "pipe", stderr: "pipe" })
  const [output, errors, status] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect({ status, errors }).toMatchObject({ status: 0 })
  const report = JSON.parse(output.trim().split("\n").at(-1)!)
  expect(report).toMatchObject({ downloads: 3, sessionPreserved: true })
  expect(report.coldProviders).toBeGreaterThanOrEqual(25)
  expect(report.refreshedProviders).toBeGreaterThanOrEqual(25)
}, 90_000)

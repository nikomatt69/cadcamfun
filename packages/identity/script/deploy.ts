/** Migrate the selected identity database before publishing its Worker. */
const staging = process.argv.includes("--staging")
const environment = staging ? "staging" : ""
const cwd = new URL("..", import.meta.url).pathname
for (const args of [
  ["d1", "migrations", "apply", "DB", "--remote", "--env", environment],
  ["deploy", "--env", environment],
]) {
  const child = Bun.spawn(["bunx", "wrangler", ...args], { cwd, stdout: "inherit", stderr: "inherit", stdin: "inherit" })
  const status = await child.exited
  if (status !== 0) process.exit(status)
}
export {}

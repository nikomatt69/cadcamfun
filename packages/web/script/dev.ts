/** Starts the local Drizzle Studio API, then the Astro dev server. */
const studio = Bun.spawn(["bun", "./script/studio-server.ts"], {
  cwd: import.meta.dir + "/..",
  stdout: "inherit",
  stderr: "inherit",
})
const astro = Bun.spawn(["bunx", "astro", "dev"], {
  cwd: import.meta.dir + "/..",
  stdout: "inherit",
  stderr: "inherit",
  stdin: "inherit",
})

const stop = () => {
  studio.kill()
  astro.kill()
}
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
await astro.exited
stop()
process.exit(astro.exitCode ?? 0)

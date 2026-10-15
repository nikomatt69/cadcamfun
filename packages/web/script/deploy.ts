/**
 * Build the Astro site and deploy the Worker.
 * Same shape as nikcli `packages/web`: `_worker.js` is the Worker entry,
 * everything else in `dist/` is a static asset.
 */
const cwd = import.meta.dir + "/.."
const build = Bun.spawn(["bunx", "astro", "build"], { cwd, stdout: "inherit", stderr: "inherit" })
const buildCode = await build.exited
if (buildCode !== 0) process.exit(buildCode ?? 1)

await Bun.write(`${cwd}/dist/.assetsignore`, "_worker.js\n")

const deploy = Bun.spawn(["bunx", "wrangler", "deploy"], { cwd, stdout: "inherit", stderr: "inherit" })
process.exit(await deploy.exited ?? 1)

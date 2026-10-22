#!/usr/bin/env bun
/**
 * Lint the GitHub Actions workflows.
 *
 * `actionlint` checks the workflow syntax, the expressions, the shell of every `run:`
 * step and the inputs of the local composite actions, and it reads `.github/actionlint.yaml`
 * for the repository variables the workflows are allowed to use. A workflow that does not
 * lint is a workflow that cannot run, and the release is built out of workflows.
 *
 *   bun run lint:workflows
 *
 * `actionlint` has to be installed (`brew install actionlint`); it is not a dependency of
 * the workspace, so the script says so plainly when it is missing.
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureCommand } from "./release-helpers.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WORKFLOWS = join(ROOT, ".github", "workflows");

/** The places actionlint is usually installed on. */
const CANDIDATES = [
  "actionlint",
  "/opt/homebrew/bin/actionlint",
  "/usr/local/bin/actionlint",
  "/usr/bin/actionlint",
];

async function findActionlint(): Promise<string | null> {
  for (const candidate of CANDIDATES) {
    const binary = Bun.which(candidate);
    if (binary !== null) return binary;
  }
  return null;
}

async function workflowFiles(): Promise<string[]> {
  const entries = await readdir(WORKFLOWS).catch(() => [] as string[]);
  return entries
    .filter((entry) => entry.endsWith(".yml") || entry.endsWith(".yaml"))
    .sort()
    .map((entry) => join(WORKFLOWS, entry));
}

if (import.meta.main) {
  const binary = await findActionlint();
  if (binary === null) {
    process.stderr.write("actionlint is not installed (brew install actionlint)\n");
    process.exitCode = 1;
  } else {
    const files = await workflowFiles();
    if (files.length === 0) {
      process.stderr.write(`No workflows found in ${WORKFLOWS}\n`);
      process.exitCode = 1;
    } else {
      const result = await captureCommand([binary, ...files]);
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
      if (result.code === 0) process.stdout.write(`actionlint: ${files.length} workflow(s) are valid\n`);
      process.exitCode = result.code;
    }
  }
}

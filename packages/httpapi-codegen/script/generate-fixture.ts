#!/usr/bin/env bun
// Regenerates test/generated from test/fixture.ts after emitter changes.
import { fileURLToPath } from "node:url"
import { BunFileSystem } from "@effect/platform-bun"
import { Effect } from "effect"
import { compile, emitEffect, write } from "../src/index"
import { Api } from "../test/fixture"

await Effect.runPromise(
  write(emitEffect(compile(Api)), fileURLToPath(new URL("../test/generated", import.meta.url))).pipe(
    Effect.provide(BunFileSystem.layer),
  ),
)
console.log("regenerated test/generated")

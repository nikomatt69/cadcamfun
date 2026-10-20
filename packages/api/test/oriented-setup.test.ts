import { expect, test } from "bun:test"
import { Schema } from "effect"
import { cam } from "@cadcamfun/core"
import { CamManufactureInput, CamManufactureOperationInput } from "../src/ai-cam.ts"
import { CamKernelRequest, CamKernelArtifact } from "../src/cam-kernel.ts"

test("HTTP and both assistant manufacturing actions preserve explicit setup orientation and reject invalid directions", () => {
  for (const orientation of cam.kernel.SETUP_ORIENTATIONS) {
    for (const schema of [CamManufactureInput, CamManufactureOperationInput]) {
      expect(Schema.decodeUnknownSync(schema)({ material: "6061", setupOrientation: orientation, workOffset: "G56" }).setupOrientation).toBe(orientation)
      expect(() => Schema.decodeUnknownSync(schema)({ material: "6061", setupOrientation: "side" })).toThrow()
    }
    const request = Schema.decodeUnknownSync(CamKernelRequest)({ schemaVersion: 1, id: "j", name: "Setup", material: "6061", elements: [{ id: "p", type: "cube", width: 10, height: 8, depth: 6 }], setupOrientation: orientation })
    const job = cam.kernel.jobOfSnapshot(request)
    if (job.status !== "ok") throw new Error("snapshot failed")
    expect(job.value.setupOrientation).toBe(orientation)
  }
})

test("oriented artifacts keep the setup and unresolved claims through wire encoding", () => {
  const r = cam.kernel.runJob({ schemaVersion: 1, id: "j", name: "Side", material: "6061", setupOrientation: "+X", part: { kind: "elements", elements: [{ id: "p", type: "cube", width: 10, height: 8, depth: 6 }] }, operations: [{ id: "f", strategy: "face", bottom: 5, tool: "flat-6" }] })
  if (r.status !== "ok") throw new Error(JSON.stringify(r.issues))
  const artifact = Schema.decodeUnknownSync(CamKernelArtifact)(Schema.encodeSync(CamKernelArtifact)(r.value))
  expect(artifact.setupOrientation).toBe("+X")
  expect(artifact.claims.find((c) => c.id === "setup-workholding")?.status).toBe("unresolved")
  expect(artifact.claims.find((c) => c.id === "part-coverage")?.status).toBe("unresolved")
  expect(artifact.release).toBe("preview")
})

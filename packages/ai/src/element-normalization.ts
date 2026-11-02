/** Native tool Promise adapter: isolate history rebuilds, keep primitive validation on its cheap pure path. */
import { hasParametricElements, normalizeElement } from "./element-catalog.ts"
import { runKernelJob } from "./kernel-job.ts"

export const normalizeElementBatch = async (elements: ReadonlyArray<Record<string, unknown>>, signal?: AbortSignal) =>
  hasParametricElements(elements)
    ? structuredClone(await runKernelJob("cad-normalize", { elements }, { signal }))
    : elements.map((element) => normalizeElement(element))

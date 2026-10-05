export interface ImportResults {
  created: string[]
  updated: string[]
  skipped: string[]
  errors: { id: string; error: string }[]
}

export interface ImportOps<T> {
  /** Validation message for an invalid item, or undefined when valid. */
  validate(item: T): string | undefined
  /** Whether an existing record should be matched for this mode (`update` may be stricter than `skip`). */
  exists(id: string, mode: "update" | "skip"): Promise<boolean>
  create(item: T): Promise<string>
  update(id: string, item: T): Promise<string>
}

/**
 * The legacy export-import POST loop shared by materials, tools, machine-configs, components and toolpaths:
 * mode `create` always inserts; `update` upserts by id; `skip` inserts unless the id exists.
 */
export async function importLoop<T extends { id?: unknown }>(items: ReadonlyArray<T>, mode: string, ops: ImportOps<T>): Promise<ImportResults> {
  const results: ImportResults = { created: [], updated: [], skipped: [], errors: [] }
  for (const item of items) {
    const id = typeof item.id === "string" && item.id ? item.id : undefined
    try {
      const invalid = ops.validate(item)
      if (invalid) { results.errors.push({ id: id ?? "unknown", error: invalid }); continue }
      if (mode !== "create" && mode !== "update" && mode !== "skip") {
        results.errors.push({ id: id ?? "unknown", error: `Unsupported import mode: ${mode}` })
        continue
      }
      if (mode === "create" || !id || !(await ops.exists(id, mode))) { results.created.push(await ops.create(item)); continue }
      if (mode === "skip") results.skipped.push(id)
      else results.updated.push(await ops.update(id, item))
    } catch (error) {
      results.errors.push({ id: id ?? "unknown", error: error instanceof Error ? error.message : "Unknown import error" })
    }
  }
  return results
}

import type { AppState } from "../../../shared/state/context.ts"

/** The library catalogue and project components use separate persistence tables. Read both. */
export async function loadComponentCatalogue(app: Pick<AppState, "client" | "runtime">) {
  const [catalogue, projects] = await Promise.all([
    app.runtime.run(app.client.library.list({ query: { category: "components" } })),
    app.runtime.run(app.client.projects.list())
  ])
  const projectRows = await Promise.all(projects.map((project) =>
    app.runtime.run(app.client.components.listForProject({ params: { id: project.id } }))))
  return [...catalogue, ...projectRows.flat()]
}

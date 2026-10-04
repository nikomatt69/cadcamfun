import { ApiClient } from "./api"

/** Tool / material / machine library from the server. */
export const libraryAtom = ApiClient.query("cam", "library", { reactivityKeys: ["library"] })

/** Project list; refreshed whenever a mutation invalidates the "projects" key. */
export const projectsAtom = ApiClient.query("projects", "list", { reactivityKeys: ["projects"] })

export const projectAtom = (id: string) => ApiClient.query("projects", "get", { params: { id } })

export const createProjectAtom = ApiClient.mutation("projects", "create")
export const saveProjectAtom = ApiClient.mutation("projects", "save")
export const removeProjectAtom = ApiClient.mutation("projects", "remove")
export const gcodeAtom = ApiClient.mutation("cam", "gcode")

// Library (tools / materials / machines). Every library mutation also invalidates the
// CAM library the editor uses.
export type LibraryKind = "tools" | "materials" | "machines"
export const libraryKeys = (kind: LibraryKind) => [kind, "library"]
export const libraryListAtom = {
  tools: ApiClient.query("tools", "list", { reactivityKeys: libraryKeys("tools") }),
  materials: ApiClient.query("materials", "list", { reactivityKeys: libraryKeys("materials") }),
  machines: ApiClient.query("machines", "list", { reactivityKeys: libraryKeys("machines") }),
}
export const libraryMutations = {
  tools: {
    create: ApiClient.mutation("tools", "create"),
    update: ApiClient.mutation("tools", "update"),
    remove: ApiClient.mutation("tools", "remove"),
    clone: ApiClient.mutation("tools", "clone"),
    import: ApiClient.mutation("tools", "import"),
  },
  materials: {
    create: ApiClient.mutation("materials", "create"),
    update: ApiClient.mutation("materials", "update"),
    remove: ApiClient.mutation("materials", "remove"),
    clone: ApiClient.mutation("materials", "clone"),
    import: ApiClient.mutation("materials", "import"),
  },
  machines: {
    create: ApiClient.mutation("machines", "create"),
    update: ApiClient.mutation("machines", "update"),
    remove: ApiClient.mutation("machines", "remove"),
    clone: ApiClient.mutation("machines", "clone"),
    import: ApiClient.mutation("machines", "import"),
  },
}

// Saved toolpaths
export const projectToolpathsAtom = (projectId: string) =>
  ApiClient.query("toolpaths", "listForProject", { params: { projectId }, reactivityKeys: ["toolpaths"] })
export const toolpathAtom = (id: string) =>
  ApiClient.query("toolpaths", "get", { params: { id }, reactivityKeys: [`toolpath:${id}`] })
export const toolpathVersionsAtom = (id: string) =>
  ApiClient.query("toolpaths", "versions", { params: { id }, reactivityKeys: [`toolpath:${id}`] })
export const toolpathCommentsAtom = (id: string) =>
  ApiClient.query("toolpaths", "comments", { params: { id }, reactivityKeys: [`toolpath:${id}:comments`] })
export const createToolpathAtom = ApiClient.mutation("toolpaths", "create")
export const updateToolpathAtom = ApiClient.mutation("toolpaths", "update")
export const removeToolpathAtom = ApiClient.mutation("toolpaths", "remove")
export const restoreToolpathAtom = ApiClient.mutation("toolpaths", "restore")
export const addCommentAtom = ApiClient.mutation("toolpaths", "addComment")
export const removeCommentAtom = ApiClient.mutation("toolpaths", "removeComment")

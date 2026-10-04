import { ApiClient } from "./api"

/** Tool / material / machine library from the server. */
export const libraryAtom = ApiClient.query("cam", "library", {})

/** Project list; refreshed whenever a mutation invalidates the "projects" key. */
export const projectsAtom = ApiClient.query("projects", "list", { reactivityKeys: ["projects"] })

export const projectAtom = (id: string) => ApiClient.query("projects", "get", { params: { id } })

export const createProjectAtom = ApiClient.mutation("projects", "create")
export const saveProjectAtom = ApiClient.mutation("projects", "save")
export const removeProjectAtom = ApiClient.mutation("projects", "remove")
export const gcodeAtom = ApiClient.mutation("cam", "gcode")

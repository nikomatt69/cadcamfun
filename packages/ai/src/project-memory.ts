/** Length-prefixed namespace prevents overlapping project ids from sharing notes. */
export const projectMemoryPrefix = (projectId: string): string => `project.${projectId.length}:${encodeURIComponent(projectId)}.`

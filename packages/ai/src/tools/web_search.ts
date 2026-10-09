import { webSearchInputSchema } from "../web-search.ts"
import { defineTool } from "./define.ts"
export const webSearch = defineTool("web_search", {
  parameters: webSearchInputSchema,
  execute: (input, { handlers, signal }) => handlers.webSearch ? handlers.webSearch(input, signal) : Promise.resolve({ ok: false, error: "Web search is unavailable in this host." })
})

import DocsAssistantShot from "./DocsAssistantShot"
import DownloadShot from "./DownloadShot"
import RuntimeExamples from "./RuntimeExamples"
import { TopicTile, type TopicKind, type ApiExample } from "./ProductTiles"

export type DocsTopic = TopicKind | "docs" | "mobile" | "guide" | "sidecar" | "diagnostics" | "project"

/** The illustration at the head of a docs page, chosen by the page's topic. */
export default function DocsShot({ topic, apiExample }: { topic: DocsTopic; apiExample?: ApiExample }) {
  if (topic === "docs") return <div aria-hidden="true"><DocsAssistantShot /></div>
  if (topic === "mobile") return <div aria-hidden="true"><DownloadShot /></div>
  if (topic === "guide" || topic === "sidecar" || topic === "diagnostics" || topic === "project") return <RuntimeExamples kind={topic} />
  return <TopicTile kind={topic} apiExample={apiExample} />
}

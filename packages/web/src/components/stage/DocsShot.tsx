import DocsAssistantShot from "./DocsAssistantShot"
import DownloadShot from "./DownloadShot"
import { TopicTile, type TopicKind } from "./ProductTiles"

export type DocsTopic = TopicKind | "docs" | "mobile"

/** The illustration at the head of a docs page, chosen by the page's topic. */
export default function DocsShot({ topic }: { topic: DocsTopic }) {
  if (topic === "docs") return <DocsAssistantShot />
  if (topic === "mobile") return <DownloadShot />
  return <TopicTile kind={topic} />
}

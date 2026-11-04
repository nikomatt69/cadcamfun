import type { PreviewFeatureTree } from "@cadcamfun/api"

/** Keep the server's feature order, showing only the selected element when one is selected. */
export function visibleFeatureTrees(trees: readonly PreviewFeatureTree[], selectedPartId: string | undefined): readonly PreviewFeatureTree[] {
  return selectedPartId === undefined ? trees : trees.filter((tree) => tree.elementId === selectedPartId)
}

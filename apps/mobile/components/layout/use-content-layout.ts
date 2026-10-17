import { useCallback, useState } from "react"
import { useWindowDimensions, type LayoutChangeEvent } from "react-native"
import { contentGutter, layout } from "@/lib/layout"

/** Read the presented container: an iPad sheet can be much narrower than its window. */
export function useContentLayout() {
  const window = useWindowDimensions()
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null)
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width
    if (next > 0) setMeasuredWidth((previous) => previous === next ? previous : next)
  }, [])
  const width = measuredWidth ?? Math.min(window.width, layout.contentWidth + layout.gutter * 2)
  return { width, gutter: contentGutter(width), fontScale: window.fontScale, onLayout }
}

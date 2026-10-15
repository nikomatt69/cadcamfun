import { createElement, type ComponentType } from "react"
import { requireNativeViewManager, requireOptionalNativeModule } from "expo-modules-core"
import type { ViewProps } from "react-native"

/** Native scene. Geometry is uploaded as typed arrays; the view only draws. */
export type PreviewScene = {
  setMesh(positions: Float32Array, normals: Float32Array, indices: Uint32Array): void
  setLines(lines: Float32Array): void
  setHighlight(start: number, count: number, red: number, green: number, blue: number, selectedRed: number, selectedGreen: number, selectedBlue: number): void
  setCamera(mvp: Float32Array, red: number, green: number, blue: number): void
}

type CadPreviewNative = {
  createScene(): PreviewScene
}

export type PreviewErrorEvent = { nativeEvent: { message: string } }

export type PreviewViewProps = ViewProps & {
  scene?: PreviewScene
  onError?: (event: PreviewErrorEvent) => void
}

/** Missing on web and in tests. The iOS app links this module the same way as `companion-net`. */
export const cadPreview = requireOptionalNativeModule<CadPreviewNative>("CadPreview")

let nativeView: ComponentType<PreviewViewProps> | null = null

/** Loaded on first paint so tests that never mount a preview do not touch the native view manager. */
export function PreviewView(props: PreviewViewProps) {
  nativeView ??= requireNativeViewManager<PreviewViewProps>("CadPreview", "PreviewSurface")
  return createElement(nativeView, props)
}

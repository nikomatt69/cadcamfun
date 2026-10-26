import { For, createSignal, type JSX } from "solid-js"
import { Box, LayoutGrid, Scan } from "lucide-solid"
import { t, type Key } from "../../i18n/index.ts"
import { alignedCubeKey, cubeDirection, type Vec3 } from "../camera-nav.ts"
import { CUBE_FACES, CUBE_ZONES, basisElements, cubeMatrix, faceMatrix, matrix3dCss, signNames, type CubeFace, type CubeFaceName, type CubeZone } from "../view-cube-model.ts"
import "./view-cube.css"

/** Side of the cube in CSS pixels; the stylesheet sizes the widget around it. */
export const CUBE_SIDE = 56
/** Radians the cube turns the view by per pixel dragged, and per arrow key. */
const DRAG_RADIANS_PER_PIXEL = 0.012
const KEY_RADIANS = Math.PI / 12
const DRAG_THRESHOLD_PX = 4

/** What the host calls each frame the camera moves. */
export interface ViewCubeApi {
  /** `matrixWorld.elements` of the camera that draws the scene. */
  readonly setBasis: (elements: ArrayLike<number>) => void
}

export interface ViewCubeProps {
  readonly enabled: boolean
  /** Look at the target from this unit direction (the host animates). */
  readonly onSnap: (direction: Vec3) => void
  /** Turn the eye about the target: azimuth about world Z and polar toward the poles, radians. */
  readonly onOrbit: (dAzimuth: number, dPolar: number) => void
  readonly onIsometric?: () => void
  readonly onFit?: () => void
  /** Whether the camera is orthographic; omit `onProjection` to hide the toggle. */
  readonly orthographic?: boolean
  readonly onProjection?: () => void
  /** Whether the host shows its four views at once; omit `onFourViews` to hide the toggle. */
  readonly fourViews?: boolean
  readonly onFourViews?: () => void
  readonly register?: (api: ViewCubeApi) => void
}

const faceLabel = (name: CubeFaceName): string => t(`viewport.view.${name}` as Key)

/** Accessible name and tooltip of a zone: the face, or the edge or corner between faces. */
export const zoneLabel = (zone: CubeZone): string => {
  const names = signNames(zone.sign).map(faceLabel)
  return zone.kind === "face" ? names[0]! : zone.kind === "edge" ? t("viewport.cube.edge", { a: names[0]!, b: names[1]! }) : t("viewport.cube.corner", { a: names[0]!, b: names[1]!, c: names[2]! })
}

const zonesOf = (face: CubeFace): readonly CubeZone[] => CUBE_ZONES.filter((zone) => zone.face === face.name)
const keyOf = (zone: CubeZone): string => `${zone.sign[0]},${zone.sign[1]},${zone.sign[2]}`
const signFromKey = (key: string): Vec3 => key.split(",").map(Number) as unknown as Vec3

/**
 * The orientation cube: a CSS 3D cube that shows the live camera orientation (the host feeds it the camera's frame through
 * `register`), with the six faces as buttons, edges and corners as hover zones, a drag that orbits and arrow keys that turn the
 * view. Clicking a face, edge or corner asks the host to snap there. Labels come through `t()`.
 */
export function ViewCube(props: ViewCubeProps): JSX.Element {
  let cube: HTMLDivElement | undefined
  let scene: HTMLDivElement | undefined
  const [active, setActive] = createSignal<string | undefined>()
  let lastTransform = ""
  let hot: Element[] = []

  props.register?.({
    setBasis: (elements) => {
      const transform = matrix3dCss(cubeMatrix(elements))
      if (cube && transform !== lastTransform) { lastTransform = transform; cube.style.transform = transform }
      setActive(alignedCubeKey([elements[8]!, elements[9]!, elements[10]!]))
    }
  })

  const setHot = (key: string | undefined): void => {
    for (const element of hot) element.classList.remove("is-hot")
    hot = key && cube ? Array.from(cube.querySelectorAll(`[data-dir="${key}"]`)) : []
    for (const element of hot) element.classList.add("is-hot")
  }
  const zoneOf = (event: Event): HTMLElement | null => (event.target instanceof Element ? event.target.closest<HTMLElement>("[data-dir]") : null)

  let drag: { id: number; x: number; y: number; moved: boolean } | undefined
  let suppressClick = false
  const down = (event: PointerEvent): void => {
    if (!props.enabled || event.button !== 0) return
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
  }
  const move = (event: PointerEvent): void => {
    if (!drag || event.pointerId !== drag.id) { if (!drag) setHot(zoneOf(event)?.dataset.dir); return }
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
      drag.moved = true
      setHot(undefined)
      try { scene?.setPointerCapture(event.pointerId) } catch { /* a synthetic pointer cannot be captured */ }
    }
    drag.x = event.clientX; drag.y = event.clientY
    // Dragging right swings the eye to the left (the scene follows the hand), dragging down raises it.
    props.onOrbit(-dx * DRAG_RADIANS_PER_PIXEL, dy * DRAG_RADIANS_PER_PIXEL)
  }
  const up = (event: PointerEvent): void => {
    if (drag?.moved) suppressClick = true
    try { scene?.releasePointerCapture(event.pointerId) } catch { /* not captured */ }
    drag = undefined
  }
  const click = (event: MouseEvent): void => {
    if (suppressClick) { suppressClick = false; return }
    if (!props.enabled) return
    const zone = zoneOf(event)
    const direction = zone?.dataset.dir ? cubeDirection(signFromKey(zone.dataset.dir)) : undefined
    if (direction) props.onSnap(direction.direction)
  }
  const key = (event: KeyboardEvent): void => {
    if (!props.enabled) return
    const turn: Record<string, readonly [number, number]> = { ArrowLeft: [-KEY_RADIANS, 0], ArrowRight: [KEY_RADIANS, 0], ArrowUp: [0, KEY_RADIANS], ArrowDown: [0, -KEY_RADIANS] }
    const step = turn[event.key]
    if (step) { event.preventDefault(); props.onOrbit(step[0], step[1]) }
    else if (event.key === "Home") { event.preventDefault(); props.onIsometric?.() }
  }

  return <div class="vp3-viewcube" role="group" aria-label={t("viewport.cube")} data-testid="view-cube" data-disabled={props.enabled ? undefined : "true"} onKeyDown={key}>
    <div ref={scene} class="vp3-viewcube__scene" title={t("viewport.cube.hint")} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => { if (!drag) setHot(undefined) }} onClick={click}>
      <div ref={cube} class="vp3-viewcube__cube" style={{ transform: matrix3dCss(cubeMatrix(basisElements([1, -1, 0.8]))) }}>
        <For each={CUBE_FACES}>{(face) =>
          <div class="vp3-viewcube__face" data-face={face.name} style={{ transform: matrix3dCss(faceMatrix(face, CUBE_SIDE)) }}>
            <For each={zonesOf(face)}>{(zone) => zone.kind === "face"
              ? <button type="button" class="vp3-viewcube__zone vp3-viewcube__zone--face" data-dir={keyOf(zone)} data-kind="face" disabled={!props.enabled} aria-pressed={active() === keyOf(zone)} aria-label={zoneLabel(zone)}>{zoneLabel(zone)}</button>
              : <span class="vp3-viewcube__zone" data-dir={keyOf(zone)} data-kind={zone.kind} title={zoneLabel(zone)} aria-hidden="true" />}
            </For>
          </div>}
        </For>
      </div>
    </div>
    <div class="vp3-viewcube__tools" role="toolbar" aria-label={t("viewport.view")}>
      <button type="button" disabled={!props.enabled} title={t("viewport.cube.home")} aria-label={t("viewport.cube.home")} onClick={() => props.onIsometric?.()}><Box size={13} aria-hidden="true" /></button>
      <button type="button" disabled={!props.enabled} title={t("viewport.cube.fit")} aria-label={t("viewport.cube.fit")} onClick={() => props.onFit?.()}><Scan size={13} aria-hidden="true" /></button>
      {props.onFourViews
        ? <button type="button" disabled={!props.enabled} aria-pressed={!!props.fourViews} title={t("viewport.cube.fourViews")} aria-label={t("viewport.cube.fourViews")} onClick={() => props.onFourViews?.()}><LayoutGrid size={13} aria-hidden="true" /></button>
        : null}
      {props.onProjection
        ? <button type="button" class="vp3-viewcube__projection" disabled={!props.enabled} aria-pressed={!!props.orthographic} title={t(props.orthographic ? "viewport.cube.orthographic" : "viewport.cube.perspective")} aria-label={t("viewport.cube.projection")} onClick={() => props.onProjection?.()}>{t(props.orthographic ? "viewport.cube.orthographicShort" : "viewport.cube.perspectiveShort")}</button>
        : null}
    </div>
  </div>
}

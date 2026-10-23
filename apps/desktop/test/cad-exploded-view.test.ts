import { expect, test } from "bun:test"
import * as THREE from "three"
import { ExplodedView, DEFAULT_EXPLODED_VIEW } from "../src/features/cad/lib/exploded-view.ts"
import { FrameScheduler } from "../src/features/cad/lib/frame-scheduler.ts"
import { buildElementObject, disposeObject } from "../src/features/cad/lib/sceneHelpers.ts"
import { installDom } from "./helpers/dom.ts"

const box = (x = 0, width = 10) => {
  const object = new THREE.Mesh(new THREE.BoxGeometry(width, 10, 10), new THREE.MeshBasicMaterial())
  object.position.x = x
  return object
}
const bounds = (object: THREE.Object3D) => new THREE.Box3().setFromObject(object)

test("exploded geometry animates, reverses without a jump, and restores exact assembled poses", () => {
  const scene = new THREE.Scene(), a = box(-5), b = box(5)
  scene.add(a, b)
  const view = new ExplodedView()
  const before = [a.position.clone(), b.position.clone()]
  view.configure([a, b], "x")
  view.setTarget(1)
  expect(view.tick(0)).toBe(true)
  expect(a.position.x).toBeLessThan(before[0]!.x)
  expect(b.position.x).toBeGreaterThan(before[1]!.x)
  const moving = b.position.x
  view.setTarget(0)
  expect(b.position.x).toBe(moving)
  view.tick(16)
  expect(b.position.x).toBeLessThan(moving)
  for (let time = 32; time < 2000; time += 16) view.tick(time)
  expect(view.active).toBe(false)
  expect(a.position.equals(before[0]!)).toBe(true)
  expect(b.position.equals(before[1]!)).toBe(true)
  view.dispose(); disposeObject(scene)
})

test("automatic explosion exposes concentric parts and treats edge overlays as part of their solid", () => {
  const scene = new THREE.Scene(), a = box(), b = box(0, 20), hidden = box()
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(a.geometry), new THREE.LineBasicMaterial())
  a.add(edges); hidden.visible = false
  scene.add(a, b, hidden)
  const view = new ExplodedView()
  view.configure([a, b, hidden], "auto")
  expect(view.count).toBe(2)
  view.setTarget(1, true)
  expect(bounds(a).intersectsBox(bounds(b))).toBe(false)
  expect(edges.position.toArray()).toEqual([0, 0, 0])
  const first = [a.position.toArray(), b.position.toArray()]
  view.configure([a, b, hidden], "auto")
  expect([a.position.toArray(), b.position.toArray()]).toEqual(first)
  view.dispose(); disposeObject(scene)
})

test("real nested CAD components explode in world axes through rotated and nonuniform scaled parents", () => {
  const source = { id: "assembly", layerId: "default", type: "component", x: 30, y: 40, z: 50, rotation: { x: 0, y: 0, z: Math.PI / 3 }, scale: { x: 2, y: 3, z: 0.5 },
    elements: [{ id: "group", type: "group", x: 7, y: 2, z: 1, rotation: { x: 0.2, y: 0.4, z: 0.1 },
      elements: [
        { id: "a", type: "cube", x: -5, y: 0, z: 0, width: 10, height: 10, depth: 10 },
        { id: "b", type: "cube", x: 5, y: 0, z: 0, width: 10, height: 10, depth: 10 },
        { id: "stock", type: "workpiece", x: 0, y: 0, z: 0, width: 100, height: 100, depth: 100 },
        { id: "hidden", type: "cube", visible: false, x: 0, y: 0, z: 0, width: 10, height: 10, depth: 10 }
      ] }] }
  const saved = JSON.stringify(source)
  const root = buildElementObject(source)!
  const scene = new THREE.Scene(); scene.add(root)
  const group = root.children[0]!, a = group.children[0]!, b = group.children[1]!, stock = group.children[2]!
  const original = [a, b, stock, group, root].map(object => object.position.clone())
  const centers = [bounds(a).getCenter(new THREE.Vector3()), bounds(b).getCenter(new THREE.Vector3())]
  const view = new ExplodedView()
  view.configure([root], "z")
  expect(view.count).toBe(2)
  view.setTarget(1, true)
  for (const [index, object] of [a, b].entries()) {
    const after = bounds(object).getCenter(new THREE.Vector3())
    expect(after.x).toBeCloseTo(centers[index]!.x, 8)
    expect(after.y).toBeCloseTo(centers[index]!.y, 8)
    expect(Math.abs(after.z - centers[index]!.z)).toBeGreaterThan(1)
  }
  expect(bounds(a).intersectsBox(bounds(b))).toBe(false)
  expect(stock.position.equals(original[2]!)).toBe(true)
  expect(group.position.equals(original[3]!)).toBe(true)
  expect(root.position.equals(original[4]!)).toBe(true)
  expect(JSON.stringify(source)).toBe(saved)

  // The export seam sees assembled geometry and puts the displayed view back, including failures.
  const displayed = b.position.clone()
  const exported = view.assembled(() => root.clone(true))
  expect(exported.children[0]!.children[1]!.position.equals(original[1]!)).toBe(true)
  expect(b.position.equals(displayed)).toBe(true)
  expect(() => view.assembled(() => { throw new Error("export failed") })).toThrow("export failed")
  expect(b.position.equals(displayed)).toBe(true)
  view.dispose()
  for (const [index, object] of [a, b, stock, group, root].entries()) expect(object.position.equals(original[index]!)).toBe(true)
  disposeObject(scene)
})

test("reconciliation uses the new assembled pose and the scheduler stops after the transition", () => {
  const a = box(-5), b = box(5), view = new ExplodedView()
  view.configure([a, b], "y"); view.setTarget(1, true)
  view.release()
  b.position.x = 35
  view.configure([a, b], "y")
  view.setTarget(0)
  let callback: FrameRequestCallback | undefined, requests = 0, time = 0
  const scheduler = new FrameScheduler(() => view.tick(time), cb => { callback = cb; return ++requests }, () => { callback = undefined })
  scheduler.invalidate()
  while (callback && time < 3000) { const next = callback; callback = undefined; next(time); time += 16 }
  expect(callback).toBeUndefined()
  expect(requests).toBeGreaterThan(1)
  expect(requests).toBeLessThan(100)
  expect(b.position.toArray()).toEqual([35, 0, 0])
  // Reduced-motion transitions and a single part need no animation loop.
  view.configure([a], "auto"); view.setTarget(2, true)
  expect(view.tick(4000)).toBe(false)
  expect(a.position.toArray()).toEqual([-5, 0, 0])
  scheduler.dispose(); view.dispose(); disposeObject(a); disposeObject(b)
})

test("ribbon opens the exploded view in 3D, adjusts separation and direction, and assembles again", async () => {
  installDom("http://localhost/cad")
  const { render } = await import("solid-js/web")
  const { default: Ribbon } = await import("../src/features/cad/components/CadRibbon.tsx")
  const { useCADStore } = await import("../src/features/cad/store/cadStore.ts")
  const cad = useCADStore()
  useCADStore.setState({ explodedView: DEFAULT_EXPLODED_VIEW, explodablePartCount: 0, viewMode: "2d" })
  const root = document.createElement("div"); document.body.append(root)
  const dispose = render(() => Ribbon({ ready: true, onSurface: () => {}, onBoolean: () => {} }), root)
  const button = () => [...root.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Exploded view")!
  try {
    expect(button().disabled).toBe(true)
    useCADStore.setState({ explodablePartCount: 2 }); await Promise.resolve()
    button().click(); await Promise.resolve()
    expect(cad.viewMode).toBe("3d")
    expect(button().getAttribute("aria-pressed")).toBe("true")
    const slider = root.querySelector<HTMLInputElement>('input[aria-label="Part separation"]')!
    slider.value = "1.75"; slider.dispatchEvent(new Event("input", { bubbles: true }))
    expect(cad.explodedView.amount).toBe(1.75)
    const axis = root.querySelector<HTMLSelectElement>('select[aria-label="Explosion direction"]')!
    axis.value = "z"; axis.dispatchEvent(new Event("change", { bubbles: true }))
    expect(cad.explodedView.axis).toBe("z")
    root.querySelector<HTMLButtonElement>('button[title="Assemble"]')!.click(); await Promise.resolve()
    expect(cad.explodedView.enabled).toBe(false)
    expect(root.querySelector('input[type="range"]')).toBeNull()
    button().click(); cad.setViewMode("2d"); await Promise.resolve()
    expect(cad.explodedView.enabled).toBe(false)
    cad.setExplodedView({ amount: NaN })
    expect(cad.explodedView.amount).toBe(1.75)
  } finally {
    dispose(); root.remove()
    useCADStore.setState({ explodedView: DEFAULT_EXPLODED_VIEW, explodablePartCount: 0, viewMode: "3d" })
  }
})

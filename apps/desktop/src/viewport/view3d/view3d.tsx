import { createEffect, onCleanup, onMount } from "solid-js"
import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { isClosedShape, meshOf, tessellate, type Drawing, type Solid, type cam } from "@cadcamfun/core"
import { entityPaths, renderEntity } from "../editor2d/render.ts"
import { buildPlayback, positionAt, type Playback } from "./playback.ts"

export type ViewPreset = "perspective" | "top" | "front" | "right" | "isometric"
export interface View3DProps {
  readonly drawing?: Drawing
  readonly solids?: readonly Solid[]
  readonly extrusionHeight?: number
  readonly program?: cam.Program
  readonly preset?: ViewPreset
  readonly playing?: boolean
  readonly playbackTime?: number
  readonly playbackRate?: number
  readonly onPlaybackTimeChange?: (seconds: number) => void
}

export const disposeGroup = (group: THREE.Object3D): void => {
  group.traverse(object => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
      object.geometry.dispose()
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose()
    }
  })
  group.clear()
}

export function View3D(props: View3DProps) {
  let host: HTMLDivElement | undefined
  let rebuild = () => {}, setPreset = () => {}
  let playback: Playback = { segments: [], duration: 0, end: { x: 0, y: 0, z: 0 } }
  let seconds = 0
  createEffect(() => { props.drawing; props.solids; props.extrusionHeight; props.program; rebuild() })
  createEffect(() => { props.preset; setPreset() })
  createEffect(() => { seconds = props.playbackTime ?? 0 })
  onMount(() => {
    if (!host) return
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100000)
    camera.up.set(0, 0, 1)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    host.append(renderer.domElement)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    const content = new THREE.Group(), helpers = new THREE.Group()
    scene.add(content, helpers)
    const grid = new THREE.GridHelper(1000, 100, 0x64748b, 0x334155)
    grid.rotation.x = Math.PI / 2
    helpers.add(grid, new THREE.AxesHelper(25))
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 2))
    const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(100, 100, 200); scene.add(light)
    const marker = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf59e0b }))
    scene.add(marker)
    let radius = 100
    setPreset = () => {
      const directions: Record<ViewPreset, readonly [number, number, number]> = { perspective: [1, -1, 0.8], isometric: [1, -1, 1], top: [0, 0, 1], front: [0, -1, 0], right: [1, 0, 0] }
      const d = directions[props.preset ?? "perspective"]
      camera.position.copy(controls.target).add(new THREE.Vector3(...d).normalize().multiplyScalar(radius * 3))
      camera.up.set(0, props.preset === "top" ? 1 : 0, props.preset === "top" ? 0 : 1)
      controls.update()
    }
    const addSolid = (solid: Solid) => {
      const mesh = meshOf(solid, 0.1), geometry = new THREE.BufferGeometry()
      geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3)); geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1)); geometry.computeVertexNormals()
      content.add(new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.2, roughness: 0.65, side: THREE.DoubleSide })))
    }
    const addLines = (positions: number[], rapid: boolean) => {
      if (!positions.length) return
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
      const line = new THREE.LineSegments(geometry, rapid ? new THREE.LineDashedMaterial({ color: 0xf59e0b, dashSize: 2, gapSize: 1 }) : new THREE.LineBasicMaterial({ color: 0x38bdf8 }))
      line.computeLineDistances(); content.add(line)
    }
    rebuild = () => {
      disposeGroup(content)
      for (const solid of props.solids ?? []) addSolid(solid)
      for (const raw of props.drawing?.entities ?? []) {
        if (!raw.visible || props.drawing?.layers.find(l => l.id === raw.layerId)?.visible === false) continue
        const e = renderEntity(raw)
        if ((props.extrusionHeight ?? 0) !== 0 && isClosedShape(e)) {
          for (const profile of tessellate(e, 0.1)) if (profile.length >= 3) addSolid({ _tag: "Extrude", profile, height: props.extrusionHeight ?? 0 })
        } else {
          const positions: number[] = []
          for (const points of entityPaths(e)) for (let i = 1; i < points.length; i++) { const a = points[i - 1], b = points[i]; if (a && b) positions.push(a.x, a.y, 0, b.x, b.y, 0) }
          addLines(positions, false)
        }
      }
      playback = props.program ? buildPlayback(props.program) : { segments: [], duration: 0, end: { x: 0, y: 0, z: 0 } }
      const rapid: number[] = [], cuts: number[] = []
      for (const s of playback.segments) (s.rapid ? rapid : cuts).push(s.from.x, s.from.y, s.from.z, s.to.x, s.to.y, s.to.z)
      addLines(rapid, true); addLines(cuts, false)
      const box = new THREE.Box3().setFromObject(content)
      if (!box.isEmpty()) { box.getCenter(controls.target); radius = Math.max(10, box.getSize(new THREE.Vector3()).length() / 2) }
      setPreset()
    }
    rebuild()
    const observer = new ResizeObserver(() => {
      if (!host) return
      const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight)
      renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix()
    })
    observer.observe(host)
    let previous = performance.now(), frame = 0
    const animate = (now: number) => {
      if (props.playing) {
        seconds = Math.min(playback.duration, seconds + (now - previous) / 1000 * Math.max(0, props.playbackRate ?? 1))
        props.onPlaybackTimeChange?.(seconds)
      }
      previous = now
      const p = positionAt(playback, seconds); marker.position.set(p.x, p.y, p.z); marker.visible = playback.segments.length > 0
      controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    onCleanup(() => { cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); disposeGroup(content); disposeGroup(helpers); marker.geometry.dispose(); marker.material.dispose(); renderer.dispose(); renderer.domElement.remove(); rebuild = () => {}; setPreset = () => {} })
  })
  return <div ref={host} role="img" aria-label="3D drawing and toolpath viewport" style={{ width: "100%", height: "100%", overflow: "hidden" }} />
}

import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { createEffect, onCleanup, onMount } from "solid-js"
import { Doc, Elements, Geometry } from "@cadcamfun/core"
import { useEditor } from "../editor/store"

/** 3D preview: stock, extruded closed profiles and toolpaths. Loaded lazily (three.js is large). */
export default function Viewport3D() {
  const ed = useEditor()
  let host!: HTMLDivElement

  onMount(() => {
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    host.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x111318)
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000)
    camera.up.set(0, 0, 1)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    scene.add(new THREE.AmbientLight(0xffffff, 0.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.2)
    sun.position.set(100, -100, 200)
    scene.add(sun)
    const content = new THREE.Group()
    scene.add(content)

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = host
      renderer.setSize(w, h)
      camera.aspect = w / Math.max(h, 1)
      camera.updateProjectionMatrix()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    let frame = 0
    const loop = () => {
      frame = requestAnimationFrame(loop)
      controls.update()
      renderer.render(scene, camera)
    }
    loop()

    let framed = false
    createEffect(() => {
      const doc = ed.doc()
      const setup = ed.setup()
      const output = ed.output()
      content.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose()
          ;(o.material as THREE.Material).dispose()
        }
      })
      content.clear()

      const thickness = setup.stock?.size.z ?? 10
      if (setup.stock) {
        const s = setup.stock
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(s.size.x, s.size.y, s.size.z),
          new THREE.MeshStandardMaterial({ color: 0xc8a165, transparent: true, opacity: 0.25 }),
        )
        box.position.set(s.origin.x + s.size.x / 2, s.origin.y + s.size.y / 2, -s.size.z / 2)
        content.add(box)
      }

      let layer = 0
      for (const element of Doc.visibleElements(doc)) {
        if (element._tag === "Sphere") {
          const m = new THREE.Mesh(
            new THREE.SphereGeometry(element.radius, 32, 16),
            new THREE.MeshStandardMaterial({ color: 0x60a5fa }),
          )
          m.position.set(element.center.x, element.center.y, element.center.z)
          content.add(m)
          continue
        }
        for (const path of Elements.toPaths(element)) {
          if (path.closed && path.points.length >= 3) {
            const shape = new THREE.Shape(path.points.map((p) => new THREE.Vector2(p.x, p.y)))
            const depth =
              element._tag === "Box" ? element.size.z : element._tag === "Cylinder" ? element.height : thickness
            const z0 =
              element._tag === "Box" ? element.origin.z : element._tag === "Cylinder" ? element.base.z : -thickness
            const mesh = new THREE.Mesh(
              new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }),
              new THREE.MeshStandardMaterial({
                color: ed.selection().has(element.id) ? 0xf59e0b : 0x60a5fa,
                transparent: true,
                opacity: 0.55,
                // Coplanar extrusions (a hole inside a plate) would z-fight; later shapes win.
                polygonOffset: true,
                polygonOffsetFactor: -++layer,
              }),
            )
            mesh.position.z = z0
            content.add(mesh)
          } else {
            const geo = new THREE.BufferGeometry().setFromPoints(path.points.map((p) => new THREE.Vector3(p.x, p.y, 0)))
            content.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x93c5fd })))
          }
        }
      }

      if (output) {
        const feeds: Array<THREE.Vector3> = []
        const rapids: Array<THREE.Vector3> = []
        for (const tp of output.program.toolpaths) {
          let prev: THREE.Vector3 | undefined
          for (const m of tp.moves) {
            const v = new THREE.Vector3(m.x, m.y, m.z)
            if (prev) (m._tag === "Rapid" ? rapids : feeds).push(prev, v)
            prev = v
          }
        }
        const seg = (pts: Array<THREE.Vector3>, color: number) =>
          new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color }))
        content.add(seg(feeds, 0x22d3ee), seg(rapids, 0xfacc15))
      }

      if (!framed) {
        const b = Doc.bounds(doc) ?? { min: { x: 0, y: 0 }, max: { x: 100, y: 100 } }
        const c = Geometry.boundsCenter(b)
        const s = Math.max(...Object.values(Geometry.boundsSize(b)), 50)
        controls.target.set(c.x, c.y, 0)
        camera.position.set(c.x + s, c.y - s * 1.2, s * 1.1)
        framed = true
      }
    })

    onCleanup(() => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      host.replaceChildren()
    })
  })

  return <div ref={host} class="h-full w-full" />
}

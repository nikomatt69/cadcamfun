import * as THREE from "three"
import type { Element } from "../../cad/store/elementsStore.ts"

const value = (element: Element, key: string, fallback: number): number =>
  typeof element[key] === "number" && Number.isFinite(element[key]) ? element[key] as number : fallback

const material = (element: Element, fallback: number): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color: element.color ?? fallback, wireframe: element.wireframe === true, roughness: 0.62, metalness: 0.08 })

/** Builds saved component data with the same Three.js primitive mapping as the legacy component details preview. */
export const createComponentPreviewObject = (element: Element): THREE.Object3D | null => {
  const x = value(element, "x", 0), y = value(element, "y", 0), z = value(element, "z", 0)
  const children = Array.isArray(element.elements) ? element.elements as Element[] : []
  const group = (fallback: number): THREE.Group => {
    const result = new THREE.Group()
    result.position.set(x, y, z)
    for (const child of children) {
      const object = createComponentPreviewObject(child)
      if (object) result.add(object)
    }
    if (children.length === 0 && (element.type === "component" || element.type === "custom")) {
      const placeholder = new THREE.Mesh(new THREE.BoxGeometry(value(element, "width", 1), value(element, "height", 1), value(element, "depth", 1)), new THREE.MeshBasicMaterial({ color: element.color ?? fallback, wireframe: true, transparent: true, opacity: 0.7 }))
      result.add(placeholder)
    }
    return result
  }
  const mesh = (geometry: THREE.BufferGeometry, fallback: number): THREE.Mesh => {
    const result = new THREE.Mesh(geometry, material(element, fallback))
    result.position.set(x, y, z)
    return result
  }
  switch (element.type) {
    case "component": case "custom": case "group": return group(0x3f51b5)
    case "cube": case "box": case "rectangular-prism": case "workpiece":
      return mesh(new THREE.BoxGeometry(value(element, "width", 1), value(element, "height", 1), value(element, "depth", 1)), element.type === "workpiece" ? 0xaaaaaa : 0x1e88e5)
    case "sphere": return mesh(new THREE.SphereGeometry(value(element, "radius", 1), value(element, "segments", 32), value(element, "segments", 32)), 0x1e88e5)
    case "cylinder": {
      const object = mesh(new THREE.CylinderGeometry(value(element, "radius", 1), value(element, "radius", 1), value(element, "height", 1), value(element, "segments", 32)), 0xffc107)
      object.rotation.x = Math.PI / 2
      return object
    }
    case "cone": {
      const object = mesh(new THREE.ConeGeometry(value(element, "radius", 1), value(element, "height", 1), value(element, "segments", 32)), 0x9c27b0)
      object.rotation.x = Math.PI / 2
      return object
    }
    case "torus": return mesh(new THREE.TorusGeometry(value(element, "radius", 1), value(element, "tubeRadius", value(element, "radius", 1) / 4), value(element, "radialSegments", 16), value(element, "tubularSegments", 100)), 0xff9800)
    case "mesh": {
      const vertices = element.vertices
      const faces = element.faces
      if (!Array.isArray(vertices) || !Array.isArray(faces)) return null
      const positions: number[] = [], indices: number[] = []
      for (const vertex of vertices) {
        if (!vertex || typeof vertex !== "object") continue
        const point = vertex as Record<string, unknown>
        positions.push(Number(point.x) || 0, Number(point.y) || 0, Number(point.z) || 0)
      }
      for (const face of faces) if (Array.isArray(face) && face.length >= 3) for (let index = 2; index < face.length; index += 1) indices.push(Number(face[0]), Number(face[index - 1]), Number(face[index]))
      if (!positions.length || !indices.length) return null
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
      geometry.setIndex(indices); geometry.computeVertexNormals()
      return mesh(geometry, 0x4285f4)
    }
    default: return null
  }
}

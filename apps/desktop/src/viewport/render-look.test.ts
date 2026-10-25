import { describe, expect, test } from "bun:test"
import * as THREE from "three"
import {
  DEFAULT_LOOK_TIER, SURFACES, TIERS, applyMaterialLook, cameraBasis, createRenderLook, elementMaterialName, resolveLookTier,
  rigDirections, rigLevels, surfaceFor, syncObjectLook, type LegacyLights
} from "./render-look.ts"

const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!
const length = (a: readonly number[]): number => Math.hypot(a[0]!, a[1]!, a[2]!)

const cameraAt = (position: [number, number, number]): THREE.PerspectiveCamera => {
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
  camera.up.set(0, 0, 1)
  camera.position.set(...position)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  return camera
}

describe("tier resolution", () => {
  test("known tiers pass, anything else is the fallback", () => {
    expect(resolveLookTier("low")).toBe("low")
    expect(resolveLookTier("high")).toBe("high")
    expect(resolveLookTier("ultra")).toBe(DEFAULT_LOOK_TIER)
    expect(resolveLookTier(undefined)).toBe(DEFAULT_LOOK_TIER)
    expect(resolveLookTier(3, "low")).toBe("low")
  })

  test("low is the old look: no environment, no tone mapping, no rig", () => {
    expect(TIERS.low.environment).toBe(false)
    expect(TIERS.low.toneMapping).toBe(THREE.NoToneMapping)
    expect(TIERS.low.rig).toBeUndefined()
    expect(TIERS.low.materials).toBe(false)
    expect(TIERS.standard.environment && TIERS.high.environment).toBe(true)
    expect(TIERS.high.environmentBlur).toBeLessThan(TIERS.standard.environmentBlur)
  })
})

describe("light rig", () => {
  test("key and fill face the camera, the rim comes from behind, all are unit vectors", () => {
    for (const position of [[40, -60, 30], [-80, 10, 5], [0, 0, 90], [10, 90, -20]] as [number, number, number][]) {
      const basis = cameraBasis(cameraAt(position).matrixWorld.elements)
      const rig = rigDirections(basis)
      for (const direction of [rig.key, rig.fill, rig.rim]) expect(length(direction)).toBeCloseTo(1, 6)
      expect(dot(rig.key, basis.forward)).toBeLessThan(0)
      expect(dot(rig.fill, basis.forward)).toBeLessThan(0)
      expect(dot(rig.rim, basis.forward)).toBeGreaterThan(0)
      // Key from the left, fill from the right, both of the camera.
      expect(dot(rig.key, basis.right)).toBeLessThan(0)
      expect(dot(rig.fill, basis.right)).toBeGreaterThan(0)
      expect(dot(rig.key, basis.up)).toBeGreaterThan(0)
    }
  })

  test("the rig is rigid in the camera frame: its angles do not change with the viewpoint", () => {
    const a = rigDirections(cameraBasis(cameraAt([50, -50, 40]).matrixWorld.elements))
    const basisB = cameraBasis(cameraAt([-70, 20, 10]).matrixWorld.elements)
    const b = rigDirections(basisB)
    expect(dot(a.key, a.fill)).toBeCloseTo(dot(b.key, b.fill), 6)
    expect(dot(a.key, a.rim)).toBeCloseTo(dot(b.key, b.rim), 6)
  })

  test("camera basis from a world matrix is orthonormal and looks at the target", () => {
    const camera = cameraAt([30, -40, 20])
    const basis = cameraBasis(camera.matrixWorld.elements)
    expect(dot(basis.right, basis.up)).toBeCloseTo(0, 6)
    expect(dot(basis.right, basis.forward)).toBeCloseTo(0, 6)
    expect(dot(basis.up, basis.forward)).toBeCloseTo(0, 6)
    const toTarget = new THREE.Vector3(0, 0, 0).sub(camera.position).normalize()
    expect(dot(basis.forward, [toTarget.x, toTarget.y, toTarget.z])).toBeCloseTo(1, 6)
  })

  test("the lights of a scene are re-aimed for each camera that renders it", () => {
    const scene = new THREE.Scene()
    const stub = { toneMapping: 0, toneMappingExposure: 1, outputColorSpace: "" } as unknown as THREE.WebGLRenderer
    const look = createRenderLook(stub, scene, { legacy: LEGACY, tier: "low" })
    expect(look.tier()).toBe("low")
    expect(scene.environment).toBeNull()
    expect(stub.toneMapping).toBe(THREE.NoToneMapping)
    const rig = scene.getObjectByName("render-look")!
    const key = rig.children.find((c): c is THREE.DirectionalLight => c instanceof THREE.DirectionalLight)!
    expect(key.intensity).toBe(LEGACY.key)
    expect(key.position.toArray()).toEqual([...LEGACY.keyPosition])
    expect(rig.children.filter((c) => c instanceof THREE.DirectionalLight && c.visible)).toHaveLength(1)
    look.dispose()
    expect(scene.getObjectByName("render-look")).toBeUndefined()
  })

  test("levels scale with the host's own lighting controls and low keeps them as they are", () => {
    expect(rigLevels("low", LEGACY, LEGACY)).toBeUndefined()
    const same = rigLevels("standard", LEGACY, LEGACY)!
    expect(same.key).toBe(TIERS.standard.rig!.key)
    const dimmer = rigLevels("standard", { ...LEGACY, key: LEGACY.key / 2, ambient: 0 }, LEGACY)!
    expect(dimmer.key).toBeCloseTo(TIERS.standard.rig!.key / 2, 9)
    expect(dimmer.rim).toBeCloseTo(TIERS.standard.rig!.rim / 2, 9)
    expect(dimmer.ambient).toBe(0)
    expect(rigLevels("standard", { ...LEGACY, key: 3 }, { ...LEGACY, key: 0 })!.key).toBe(TIERS.standard.rig!.key)
  })
})

const LEGACY: LegacyLights = { ambient: 0.5, hemisphere: 0, key: 0.8, keyPosition: [-5, -7.5, 10] }

describe("material table", () => {
  test("the legacy material names and catalogue names map to metals and non-metals", () => {
    expect(surfaceFor("aluminum")).toBe(SURFACES["aluminium"])
    expect(surfaceFor("Aluminium 6061-T6")).toBe(SURFACES["aluminium"])
    expect(surfaceFor("6061")).toBe(SURFACES["aluminium"])
    expect(surfaceFor("steel")).toBe(SURFACES["steel"])
    expect(surfaceFor("Carbon steel C45 / 1045")).toBe(SURFACES["steel"])
    expect(surfaceFor("Stainless steel 1.4301 / 304")).toBe(SURFACES["stainless"])
    expect(surfaceFor("brass")).toBe(SURFACES["brass"])
    expect(surfaceFor("titanium")).toBe(SURFACES["titanium"])
    expect(surfaceFor("plastic")).toBe(SURFACES["plastic"])
    expect(surfaceFor("wood")).toBe(SURFACES["wood"])
    expect(surfaceFor("composite")).toBe(SURFACES["plastic"])
    expect(surfaceFor("Acrylic PMMA (cast)")).toBe(SURFACES["acrylic"])
  })

  test("the catalogue family wins over the name", () => {
    expect(surfaceFor("my part", "aluminium-cast")).toBe(SURFACES["aluminium"])
    expect(surfaceFor("aluminium", "brass")).toBe(SURFACES["brass"])
    expect(surfaceFor("whatever", "no-such-family")).toBeUndefined()
  })

  test("unknown, empty and placeholder materials have no surface, so the current values stay", () => {
    for (const name of ["default", "Default", "other", "", "  ", "unobtainium", undefined, null, 5]) expect(surfaceFor(name)).toBeUndefined()
  })

  test("every surface is a plausible PBR value; metals are metallic, the rest are not", () => {
    for (const [name, look] of Object.entries(SURFACES)) {
      expect(look.metalness).toBeGreaterThanOrEqual(0)
      expect(look.metalness).toBeLessThanOrEqual(1)
      expect(look.roughness).toBeGreaterThan(0.05 - 1e-9)
      expect(look.roughness).toBeLessThanOrEqual(1)
      if (["aluminium", "steel", "stainless", "brass", "copper", "titanium"].includes(name)) expect(look.metalness).toBeGreaterThan(0.8)
      if (["plastic", "wood", "foam", "board"].includes(name)) expect(look.metalness).toBe(0)
    }
  })

  test("the element's material is read from metadata first, then the field", () => {
    expect(elementMaterialName({ material: "steel" })).toBe("steel")
    expect(elementMaterialName({ material: "steel", metadata: { material: "aluminum" } })).toBe("aluminum")
    expect(elementMaterialName({ material: "" })).toBeUndefined()
    expect(elementMaterialName(null)).toBeUndefined()
  })
})

describe("applying surfaces to an object", () => {
  const solid = (color?: number) => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: color ?? 0x1e88e5 }))

  test("standard applies the surface, low and a later switch to low restore the original values", () => {
    const mesh = solid()
    const material = mesh.material as THREE.MeshStandardMaterial
    const before = { metalness: material.metalness, roughness: material.roughness, color: material.color.getHex() }
    applyMaterialLook(mesh, { material: "aluminum" }, "standard")
    expect(material.metalness).toBe(SURFACES["aluminium"]!.metalness)
    expect(material.roughness).toBe(SURFACES["aluminium"]!.roughness)
    expect(material.color.getHex()).toBe(SURFACES["aluminium"]!.color) // the element had no colour of its own
    syncObjectLook(mesh, "low")
    expect({ metalness: material.metalness, roughness: material.roughness, color: material.color.getHex() }).toEqual(before)
    syncObjectLook(mesh, "high")
    expect(material.metalness).toBe(SURFACES["aluminium"]!.metalness)
  })

  test("the colour the user gave the part is kept", () => {
    const mesh = solid(0xff0000)
    applyMaterialLook(mesh, { material: "steel", color: 0xff0000 }, "standard")
    const material = mesh.material as THREE.MeshStandardMaterial
    expect(material.color.getHex()).toBe(0xff0000)
    expect(material.metalness).toBe(SURFACES["steel"]!.metalness)
  })

  test("a low-tier build changes nothing yet can be upgraded later", () => {
    const mesh = solid()
    const material = mesh.material as THREE.MeshStandardMaterial
    applyMaterialLook(mesh, { material: "brass" }, "low")
    expect(material.metalness).toBe(0)
    syncObjectLook(mesh, "standard")
    expect(material.metalness).toBe(SURFACES["brass"]!.metalness)
  })

  test("unknown material or none leaves the material alone; shared materials are handled once", () => {
    const mesh = solid()
    const material = mesh.material as THREE.MeshStandardMaterial
    applyMaterialLook(mesh, { material: "unobtainium" }, "standard")
    applyMaterialLook(mesh, {}, "standard")
    expect(material.userData["renderLook"]).toBeUndefined()
    const group = new THREE.Group()
    const shared = new THREE.MeshStandardMaterial({ color: 0x8fa3b8, metalness: 0.25, roughness: 0.55 })
    group.add(new THREE.Mesh(new THREE.BoxGeometry(), shared), new THREE.Mesh(new THREE.BoxGeometry(), shared))
    applyMaterialLook(group, { material: "steel", color: 1 }, "standard")
    expect(shared.metalness).toBe(SURFACES["steel"]!.metalness)
    syncObjectLook(group, "low")
    expect(shared.metalness).toBe(0.25)
  })
})

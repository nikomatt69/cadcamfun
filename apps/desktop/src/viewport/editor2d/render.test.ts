import { describe, expect, test } from "bun:test"
import { baseEntity, type Entity } from "@cadcamfun/core"
import { entityPaths, outlineDistance, renderEntity } from "./render.ts"
import { createCamera, screenToWorld, worldToScreen, zoomAt } from "./camera.ts"

describe("render coordinates", () => {
  const entity: Entity = { ...baseEntity("line"), _tag: "Line", start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, transform: { translation: { x: 5, y: 7 }, rotation: Math.PI / 2, scale: { x: 2, y: 2 } } }
  test("bakes the local transform exactly once", () => {
    const paths = entityPaths(entity)
    expect(paths[0]?.[0]?.x).toBeCloseTo(5)
    expect(paths[0]?.[1]?.y).toBeCloseTo(27)
    expect(entityPaths(renderEntity(entity))).toEqual(paths)
    expect(outlineDistance(entity, { x: 5, y: 15 })).toBeCloseTo(0)
  })
  test("camera flips Y and preserves the zoom anchor", () => {
    const camera = createCamera({ x: 3, y: 8 }, 4, 800, 600)
    const point = { x: 20, y: 30 }, screen = worldToScreen(camera, point)
    expect(screen.y).toBeLessThan(300)
    expect(screenToWorld(camera, screen)).toEqual(point)
    const zoomed = screenToWorld(zoomAt(camera, 2, screen), screen)
    expect(zoomed.x).toBeCloseTo(point.x)
    expect(zoomed.y).toBeCloseTo(point.y)
  })
  test("closed outlines include their final edge for picking", () => {
    const rectangle: Entity = { ...baseEntity("rect"), _tag: "Rectangle", corner1: { x: 0, y: 0 }, corner2: { x: 10, y: 10 } }
    expect(outlineDistance(rectangle, { x: 0, y: 5 })).toBe(0)
  })
})

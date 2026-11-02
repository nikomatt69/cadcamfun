/**
 * Facts about a triangle mesh that decide how the canvas draws it. Pure and linear in the number of triangles, so they are safe on an
 * imported scan.
 */

/**
 * Whether every edge of the mesh is shared by exactly two triangles walked in opposite directions: a closed, consistently oriented
 * skin. Only such a mesh is a solid (it can be drawn one-sided, capped by a section, and booleaned); anything else is a sheet or a
 * damaged import and is drawn two-sided so no triangle disappears behind its back.
 *
 * Vertices are compared by index; an import that split vertices (STL) must be welded first, or every edge looks open.
 */
export const meshIsClosed = (indices: ArrayLike<number>): boolean => {
  const triangles = Math.floor(indices.length / 3)
  if (triangles === 0) return false
  // Directed edge a->b is stored as a*N+b with N above the largest index (safe integers up to 2^53: 94M vertices).
  let largest = 0
  for (let i = 0; i < triangles * 3; i++) if (indices[i]! > largest) largest = indices[i]!
  const stride = largest + 1
  const directed = new Map<number, number>()
  for (let t = 0; t < triangles; t++) {
    for (let k = 0; k < 3; k++) {
      const a = indices[t * 3 + k]!, b = indices[t * 3 + ((k + 1) % 3)]!
      if (a === b) continue
      const key = a * stride + b
      if (directed.has(key)) return false // an edge walked twice the same way: not consistently oriented, or non-manifold
      directed.set(key, 1)
    }
  }
  for (const key of directed.keys()) {
    const a = Math.floor(key / stride), b = key - a * stride
    if (!directed.has(b * stride + a)) return false
  }
  return true
}

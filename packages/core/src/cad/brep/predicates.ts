/**
 * Robust geometric predicates (spec 42 R2): orient2d, orient3d and incircle with the exact sign, after Shewchuk's adaptive
 * scheme. A floating-point filter with a proven error bound answers almost every call; only when the result is within the bound
 * of zero (collinear, coplanar, cocircular within rounding) the determinant is evaluated exactly with floating-point
 * expansions (sums of non-overlapping doubles), so the sign is never wrong. The value returned has the exact sign; its
 * magnitude is exact only when the filter passed.
 *
 * Used where a decision is topological and a wrong sign makes a valid-looking wrong answer: the winding of a point in a face's
 * boundary polygon (point-in-face in `classify.ts`, fragment holes and samples in `boolean.ts`). Decisions on analytic
 * surfaces (a point against a plane, a sphere, a cylinder) keep a tolerance with a stated bound: they compare a computed
 * distance with the model tolerance, which is a modelling decision, not a sign question.
 */

const EPS = 2 ** -53
const ERR_O2D = (3 + 16 * EPS) * EPS
const ERR_O3D = (7 + 56 * EPS) * EPS
const ERR_INCIRCLE = (10 + 96 * EPS) * EPS
const SPLITTER = 2 ** 27 + 1

type Expansion = number[]

const twoSum = (a: number, b: number): [number, number] => {
  const x = a + b
  const bv = x - a
  const av = x - bv
  return [x, (a - av) + (b - bv)]
}

const twoDiff = (a: number, b: number): [number, number] => {
  const x = a - b
  const bv = a - x
  const av = x + bv
  return [x, (a - av) + (bv - b)]
}

const twoProduct = (a: number, b: number): [number, number] => {
  const x = a * b
  let c = SPLITTER * a
  const ahi = c - (c - a)
  const alo = a - ahi
  c = SPLITTER * b
  const bhi = c - (c - b)
  const blo = b - bhi
  const err = x - ahi * bhi - alo * bhi - ahi * blo
  return [x, alo * blo - err]
}

/** e + b as a non-overlapping expansion, smallest component first, zeros removed. */
const grow = (e: Expansion, b: number): Expansion => {
  const out: Expansion = []
  let q = b
  for (const ei of e) {
    const [x, y] = twoSum(q, ei)
    q = x
    if (y !== 0) out.push(y)
  }
  if (q !== 0 || out.length === 0) out.push(q)
  return out
}

const sum = (e: Expansion, f: Expansion): Expansion => {
  let r = e
  for (const fi of f) r = grow(r, fi)
  return r
}

const negate = (e: Expansion): Expansion => e.map((x) => -x)

/** e * b exactly. */
const scaleBy = (e: Expansion, b: number): Expansion => {
  let r: Expansion = [0]
  for (const ei of e) {
    const [hi, lo] = twoProduct(ei, b)
    r = grow(grow(r, lo), hi)
  }
  return r
}

const mul = (e: Expansion, f: Expansion): Expansion => {
  let r: Expansion = [0]
  for (const fi of f) r = sum(r, scaleBy(e, fi))
  return r
}

/** a - b exactly, as a two-component expansion. */
const diff = (a: number, b: number): Expansion => {
  const [x, y] = twoDiff(a, b)
  return y === 0 ? [x] : [y, x]
}

/** The sign of an expansion is the sign of its largest (last) nonzero component. */
const signOf = (e: Expansion): number => {
  for (let i = e.length - 1; i >= 0; i--) if (e[i] !== 0) return e[i]! > 0 ? 1 : -1
  return 0
}

/** An expansion collapsed to one double with the exact sign (the sum, smallest first, keeps the sign of the largest part). */
const estimate = (e: Expansion): number => {
  const s = signOf(e)
  if (s === 0) return 0
  let t = 0
  for (const x of e) t += x
  // Rounding cannot flip the sign of a nonoverlapping sum, but guard against a cancelled estimate.
  return Math.sign(t) === s && t !== 0 ? t : s * Number.MIN_VALUE
}

/**
 * Orientation of c relative to the directed line a -> b: positive when a, b, c turn counter-clockwise, negative clockwise,
 * zero only when exactly collinear. The sign is exact.
 */
export const orient2d = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number => {
  const detleft = (ax - cx) * (by - cy)
  const detright = (ay - cy) * (bx - cx)
  const det = detleft - detright
  const bound = ERR_O2D * (Math.abs(detleft) + Math.abs(detright))
  if (det > bound || -det > bound) return det
  const adx = diff(ax, cx), ady = diff(ay, cy), bdx = diff(bx, cx), bdy = diff(by, cy)
  return estimate(sum(mul(adx, bdy), negate(mul(ady, bdx))))
}

/**
 * Side of the plane through a, b, c on which d lies: positive when d is below the plane (a, b, c counter-clockwise seen
 * from above), negative above, zero only when exactly coplanar. The sign is exact.
 */
export const orient3d = (
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  dx: number, dy: number, dz: number
): number => {
  const adx = ax - dx, bdx = bx - dx, cdx = cx - dx
  const ady = ay - dy, bdy = by - dy, cdy = cy - dy
  const adz = az - dz, bdz = bz - dz, cdz = cz - dz
  const bdxcdy = bdx * cdy, cdxbdy = cdx * bdy
  const cdxady = cdx * ady, adxcdy = adx * cdy
  const adxbdy = adx * bdy, bdxady = bdx * ady
  const det = adz * (bdxcdy - cdxbdy) + bdz * (cdxady - adxcdy) + cdz * (adxbdy - bdxady)
  const permanent = (Math.abs(bdxcdy) + Math.abs(cdxbdy)) * Math.abs(adz) + (Math.abs(cdxady) + Math.abs(adxcdy)) * Math.abs(bdz) + (Math.abs(adxbdy) + Math.abs(bdxady)) * Math.abs(cdz)
  const bound = ERR_O3D * permanent
  if (det > bound || -det > bound) return det
  const eadx = diff(ax, dx), ebdx = diff(bx, dx), ecdx = diff(cx, dx)
  const eady = diff(ay, dy), ebdy = diff(by, dy), ecdy = diff(cy, dy)
  const eadz = diff(az, dz), ebdz = diff(bz, dz), ecdz = diff(cz, dz)
  const t1 = mul(eadz, sum(mul(ebdx, ecdy), negate(mul(ecdx, ebdy))))
  const t2 = mul(ebdz, sum(mul(ecdx, eady), negate(mul(eadx, ecdy))))
  const t3 = mul(ecdz, sum(mul(eadx, ebdy), negate(mul(ebdx, eady))))
  return estimate(sum(sum(t1, t2), t3))
}

/**
 * Whether d lies inside the circle through a, b, c (counter-clockwise): positive inside, negative outside, zero only when
 * exactly cocircular. The sign is exact.
 */
export const incircle = (
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number
): number => {
  const adx = ax - dx, bdx = bx - dx, cdx = cx - dx
  const ady = ay - dy, bdy = by - dy, cdy = cy - dy
  const bdxcdy = bdx * cdy, cdxbdy = cdx * bdy
  const cdxady = cdx * ady, adxcdy = adx * cdy
  const adxbdy = adx * bdy, bdxady = bdx * ady
  const alift = adx * adx + ady * ady, blift = bdx * bdx + bdy * bdy, clift = cdx * cdx + cdy * cdy
  const det = alift * (bdxcdy - cdxbdy) + blift * (cdxady - adxcdy) + clift * (adxbdy - bdxady)
  const permanent = (Math.abs(bdxcdy) + Math.abs(cdxbdy)) * alift + (Math.abs(cdxady) + Math.abs(adxcdy)) * blift + (Math.abs(adxbdy) + Math.abs(bdxady)) * clift
  const bound = ERR_INCIRCLE * permanent
  if (det > bound || -det > bound) return det
  const eadx = diff(ax, dx), ebdx = diff(bx, dx), ecdx = diff(cx, dx)
  const eady = diff(ay, dy), ebdy = diff(by, dy), ecdy = diff(cy, dy)
  const ealift = sum(mul(eadx, eadx), mul(eady, eady)), eblift = sum(mul(ebdx, ebdx), mul(ebdy, ebdy)), eclift = sum(mul(ecdx, ecdx), mul(ecdy, ecdy))
  const a = mul(ealift, sum(mul(ebdx, ecdy), negate(mul(ecdx, ebdy))))
  const b = mul(eblift, sum(mul(ecdx, eady), negate(mul(eadx, ecdy))))
  const c = mul(eclift, sum(mul(eadx, ebdy), negate(mul(ebdx, eady))))
  return estimate(sum(sum(a, b), c))
}

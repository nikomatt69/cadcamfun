/**
 * What gets machined: the panel's own geometry (rectangle, circle, polygon, custom path) or the
 * CAD elements the user selected, starting from the raw stock.
 *
 * For selected elements everything is relative to the stock:
 *  - Z0 is the stock's top face: the selection is moved so its highest face sits at `stock.topZ`;
 *  - depth never exceeds the material left under each element (stock thickness);
 *  - XY is expressed from the machine origin chosen in the origin section (stock centre by default);
 *  - an element that leaves the stock rectangle is flagged, not silently machined in the air;
 *  - several elements run top level first, inner features before the outer contour.
 */
import { drillPoints, drillPointsOf, drillWarning, elementOperation, type DrillPoint } from "./actions.ts"
import { circleToolpath, polygonToolpath, rectangleToolpath } from "./basic.ts"
import { applyOriginOffset, f3 } from "./common.ts"
import { flattenElements, isContainer, orderForMachining, outsideStock, shiftElement, topOf } from "./elements.ts"
import type { GeometryInput, Stock, ToolpathSettings } from "./schema.ts"

export const stockComment = (stock: Stock | undefined, allowance = true): string =>
  stock
    ? `; Stock: ${f3(stock.width)} x ${f3(stock.height)} x ${f3(stock.depth)} mm, top Z${f3(stock.topZ)}${allowance ? `, allowance ${f3(stock.allowance)}mm` : ""}\n`
    : ""

/** Machine-origin shift (dx, dy) for CAD coordinates, from the origin section of the panel. */
export const originShift = (s: ToolpathSettings, g: GeometryInput): { dx: number; dy: number } => {
  const stock = g.stock
  if (!stock) {
    const o = applyOriginOffset(s, g, 0, 0)
    return { dx: o.x, dy: o.y }
  }
  switch (s.originType) {
    case "workpiece-center": return { dx: -stock.x, dy: -stock.y }
    case "workpiece-corner":
    case "workpiece-corner2": return { dx: -(stock.x - stock.width / 2), dy: -(stock.y - stock.height / 2) }
    case "machine-zero": return { dx: -stock.x + stock.width, dy: -stock.y + stock.height }
    case "custom": return { dx: -stock.x + s.originX, dy: -stock.y + s.originY }
  }
}

/** Depth limited to the stock thickness; the warning says so. */
export const withinStock = (s: ToolpathSettings, stock: Stock | undefined, available = stock?.depth): { settings: ToolpathSettings; warning?: string } => {
  if (!stock || available === undefined || s.depth <= available + 1e-9) return { settings: s }
  if (available <= 0) return { settings: s, warning: "No material left under this element: nothing to cut" }
  return {
    settings: { ...s, depth: available },
    warning: `Depth ${f3(s.depth)}mm limited to the ${f3(available)}mm of stock`
  }
}

export const selectedToolpath = (s0: ToolpathSettings, g: GeometryInput): string => {
  const picked = g.selectedElements
  if (picked.length === 0) return "; No element selected for toolpath generation\n"

  // Containers are machined through their members; the legacy comment block is kept for them.
  const flat = flattenElements(picked)
  const containers = picked.filter(isContainer)
  const stock = g.stock
  const { dx, dy } = originShift(s0, g)
  const groupTop = Math.max(...flat.map(topOf))
  const dz = stock ? stock.topZ - groupTop : 0

  let out = picked.length === 1 && containers.length === 0
    ? `; Toolpath from selected element (${String(picked[0]!["type"])})\n`
    : `; Toolpath from ${picked.length} selected element(s), ${flat.length} machinable\n`
  for (const container of containers) {
    out += `; Composite element with sub-elements\n; Processing ${flattenElements([container]).length} sub-elements\n`
  }
  out += stockComment(stock)
  if (stock) out += `; Machining starts at the stock top (Z${f3(stock.topZ)}); elements aligned by ${f3(dz)}mm\n`

  const ordered = orderForMachining(flat)
  const holes: DrillPoint[] = []
  ordered.forEach((element, index) => {
    const aligned = shiftElement(element, 0, 0, dz)
    const placed = shiftElement(aligned, dx, dy, 0)
    const label = `${String(element["type"])}${element["id"] ? ` (${String(element["id"])})` : ""}`
    if (ordered.length > 1) out += `\n; Element ${index + 1}/${ordered.length}: ${label}\n`
    if (outsideStock(element, stock)) out += "; Warning: element leaves the stock rectangle\n"
    // Material under this element: stock thickness minus how far its top lies below the stock top.
    const below = stock ? Math.max(0, stock.topZ - topOf(aligned)) : 0
    const limited = withinStock(s0, stock, stock ? stock.depth - below : undefined)
    if (limited.warning) out += `; Warning: ${limited.warning}\n`
    if (stock && stock.depth - below <= 0) return
    if (s0.operationType === "drill") {
      out += drillWarning(placed, limited.settings)
      holes.push(...drillPointsOf(placed, limited.settings.depth))
      return
    }
    out += elementOperation(placed, limited.settings, g)
  })
  // Holes of every selected element are drilled as one nearest-first sequence.
  if (holes.length > 0) out += drillPoints(holes, s0, `${flat.length} element(s)`)
  return out
}

export const millToolpath = (s: ToolpathSettings, g: GeometryInput): string => {
  switch (g.geometryType) {
    case "rectangle": return rectangleToolpath(withinStock(s, g.stock).settings, g)
    case "circle": return circleToolpath(withinStock(s, g.stock).settings, g)
    case "polygon": return polygonToolpath(withinStock(s, g.stock).settings, g)
    case "custom": return g.customPath ? `; Custom path\n${g.customPath}\n` : ""
    case "selected": return selectedToolpath(s, g)
    // Primitive geometry types work on whatever is selected.
    default: return g.selectedElements.length > 0 ? selectedToolpath(s, g) : ""
  }
}


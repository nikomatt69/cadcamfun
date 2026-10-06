import type { JSX } from "solid-js"

/** The custom 24x24 line icons the legacy tool panel draws for solids, curves, dimensions and parts. */
const PATHS = {
  cylinder: `<ellipse cx="12" cy="6" rx="8" ry="3" /><line x1="4" y1="6" x2="4" y2="18" /><line x1="20" y1="6" x2="20" y2="18" /><ellipse cx="12" cy="18" rx="8" ry="3" />`,
  torus: `<circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" />`,
  pyramid: `<polygon points="12,2 22,20 2,20" />`,
  prism: `<polygon points="12,2 20,7 20,17 12,22 4,17 4,7" />`,
  hemisphere: `<path d="M12,12 C16.4183,12 20,8.41828 20,4 C20,-0.418278 16.4183,-4 12,-4 C7.58172,-4 4,-0.418278 4,4 C4,8.41828 7.58172,12 12,12 Z" /><line x1="4" y1="4" x2="20" y2="4" />`,
  ellipsoid: `<ellipse cx="12" cy="12" rx="8" ry="5" />`,
  capsule: `<path d="M12,20 L12,4" /><path d="M7,4 A5,5 0 0 1 17,4" /><path d="M7,20 A5,5 0 0 0 17,20" />`,
  ellipse: `<ellipse cx="12" cy="12" rx="10" ry="6" />`,
  arc: `<path d="M5,19 C9,9 15,9 19,19" />`,
  spline: `<path d="M3,17 C7,21 10,5 17,10 C20,12 21,17 21,17" />`,
  bezier: `<path d="M4,19 C8,10 16,14 20,5" /><circle cx="4" cy="19" r="1.5" /><circle cx="20" cy="5" r="1.5" />`,
  boolUnion: `<circle cx="9" cy="9" r="6" /><circle cx="15" cy="15" r="6" />`,
  boolSubtract: `<circle cx="9" cy="9" r="6" /><circle cx="15" cy="15" r="6" fill="white" stroke-width="0" />`,
  boolIntersect: `<circle cx="9" cy="9" r="6" /><circle cx="15" cy="15" r="6" /><path d="M12,12 m-3,0 a3,3 0 1,0 6,0 a3,3 0 1,0 -6,0" fill="currentColor" />`,
  extrude: `<polygon points="12,5 19,12 12,19 5,12" /><line x1="12" y1="5" x2="12" y2="2" />`,
  revolution: `<path d="M12,2 L12,22" /><path d="M12,6 C16,6 20,8 20,12 C20,16 16,18 12,18" />`,
  sweep: `<path d="M3,17 C8,12 16,12 21,17" /><circle cx="3" cy="17" r="2" /><circle cx="21" cy="17" r="2" />`,
  loft: `<circle cx="12" cy="4" r="3" /><circle cx="12" cy="20" r="3" /><line x1="9" y1="4" x2="9" y2="20" /><line x1="15" y1="4" x2="15" y2="20" />`,
  linearDimension: `<line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="6" x2="4" y2="18" /><line x1="20" y1="6" x2="20" y2="18" /><line x1="10" y1="6" x2="10" y2="4" /><line x1="14" y1="6" x2="14" y2="4" />`,
  angularDimension: `<path d="M12,12 L20,12" /><path d="M12,12 L12,4" /><path d="M12,12 L5,5" stroke-dasharray="2,2" /><path d="M12,10 A2,2 0 0 1 14,12" />`,
  radiusDimension: `<circle cx="12" cy="12" r="8" /><line x1="12" y1="12" x2="18" y2="12" /><text x="15" y="10" font-size="6" fill="currentColor">R</text>`,
  diameterDimension: `<circle cx="12" cy="12" r="8" /><line x1="4" y1="12" x2="20" y2="12" /><text x="10" y="9" font-size="6" fill="currentColor">Ø</text>`,
  pen: `<path d="M4,20 C6,14 12,8 20,4" />`,
  highlighter: `<path d="M9,6 l9,9 l-6,2 l-5,-5 z" stroke-width="3" stroke-opacity="0.5" />`,
  text: `<text x="6" y="16" font-size="14" font-weight="bold" fill="currentColor">A</text>`,
  eraser: `<path d="M18,14 l-8,8 l-6,-6 l8,-8 z" />`,
  screenshot: `<rect x="4" y="4" width="16" height="16" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M4,12 L7,12 M12,4 L12,7 M20,12 L17,12 M12,20 L12,17" />`,
  thread: `<path d="M12,3 v18" /><path d="M8,4 C13,7 13,13 8,16" /><path d="M16,4 C11,7 11,13 16,16" />`,
  chamfer: `<path d="M4,4 L12,4 L20,12 L20,20 L12,20 L4,12 Z" />`,
  fillet: `<path d="M4,4 h8 a8,8 0 0 1 8,8 v8" />`,
  gear: `<circle cx="12" cy="12" r="4" /><path d="M12,2 L12,4 M22,12 L20,12 M12,22 L12,20 M2,12 L4,12" /><path d="M17,7 L16,8 M17,17 L16,16 M7,17 L8,16 M7,7 L8,8" />`,
  spring: `<path d="M8,4 C14,5 10,9 16,10 C10,11 14,15 8,16 C14,17 10,21 16,22" />`,
  screw: `<line x1="12" y1="2" x2="12" y2="22" /><path d="M9,4 H15" /><path d="M10,8 H14" /><path d="M10,12 H14" /><path d="M10,16 H14" /><path d="M10,20 H14" />`,
  nut: `<polygon points="12,3 20,8 20,16 12,21 4,16 4,8" /><circle cx="12" cy="12" r="3" />`,
  washer: `<circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" />`,
  rivet: `<line x1="12" y1="5" x2="12" y2="19" /><circle cx="12" cy="5" r="3" /><circle cx="12" cy="19" r="3" />`,
  wall: `<rect x="3" y="4" width="18" height="16" /><line x1="3" y1="8" x2="21" y2="8" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="16" x2="21" y2="16" />`,
  floor: `<rect x="3" y="11" width="18" height="2" /><line x1="7" y1="9" x2="7" y2="15" /><line x1="11" y1="9" x2="11" y2="15" /><line x1="15" y1="9" x2="15" y2="15" /><line x1="19" y1="9" x2="19" y2="15" />`,
  roof: `<polygon points="2,14 12,4 22,14" /><line x1="4" y1="14" x2="20" y2="14" />`,
  window: `<rect x="5" y="5" width="14" height="14" /><line x1="5" y1="12" x2="19" y2="12" /><line x1="12" y1="5" x2="12" y2="19" />`,
  door: `<rect x="5" y="3" width="14" height="18" /><circle cx="16" cy="12" r="1" />`,
  stair: `<path d="M4,20 H8 V16 H12 V12 H16 V8 H20 V4" />`,
  column: `<rect x="9" y="3" width="6" height="18" /><path d="M7,3 H17" /><path d="M7,21 H17" />`,
  text3d: `<text x="6" y="16" font-size="14" font-weight="bold">T</text><line x1="6" y1="18" x2="18" y2="18" /><path d="M7,13 L7,18" stroke-dasharray="2,2" />`,
  path3d: `<path d="M3,12 C7,8 12,16 21,12" /><circle cx="3" cy="12" r="1" /><circle cx="21" cy="12" r="1" />`,
  pointCloud: `<circle cx="12" cy="12" r="1" /><circle cx="8" cy="9" r="1" /><circle cx="16" cy="9" r="1" /><circle cx="6" cy="14" r="1" /><circle cx="18" cy="14" r="1" /><circle cx="14" cy="18" r="1" /><circle cx="10" cy="18" r="1" />`,
  mesh: `<path d="M3,6 L21,6 L12,20 Z" /><line x1="3" y1="6" x2="12" y2="20" /><line x1="21" y1="6" x2="12" y2="20" />`,
  group: `<rect x="3" y="8" width="6" height="6" /><rect x="15" y="8" width="6" height="6" /><rect x="9" y="14" width="6" height="6" />`,
  polygon: `<polygon points="12,4 20,10 17,19 7,19 4,10" />`
} as const

export type IconName = keyof typeof PATHS

export const SvgIcon = (props: { name: IconName; size?: number }): JSX.Element => (
  <svg viewBox="0 0 24 24" width={props.size ?? 14} height={props.size ?? 14} fill="none" stroke="currentColor" stroke-width="2" innerHTML={PATHS[props.name]} />
)

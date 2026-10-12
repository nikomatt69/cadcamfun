import { For, type JSX } from "solid-js"

/** Light grid, axes and labels shared by the three "Geometry Preview" drawings. */
function Frame(props: { readonly children: JSX.Element }): JSX.Element {
  return (
    <svg width="100%" height="100%" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
      <For each={Array.from({ length: 21 })}>{(_, i) => <line x1={50 + i() * 15} y1="30" x2={50 + i() * 15} y2="270" stroke="#F3F4F6" stroke-width="1" />}</For>
      <For each={Array.from({ length: 17 })}>{(_, i) => <line x1="50" y1={30 + i() * 15} x2="350" y2={30 + i() * 15} stroke="#F3F4F6" stroke-width="1" />}</For>
      <line x1="50" y1="150" x2="350" y2="150" stroke="#E5E7EB" stroke-width="1" />
      <line x1="200" y1="30" x2="200" y2="270" stroke="#E5E7EB" stroke-width="1" />
      <text x="345" y="165" font-size="14" fill="#9CA3AF">X</text>
      <text x="210" y="40" font-size="14" fill="#9CA3AF">Y</text>
      {props.children}
      <circle cx="200" cy="150" r="5" fill="#EF4444" />
      <text x="210" y="160" font-size="12" font-weight="500" fill="#EF4444">Origin</text>
    </svg>
  )
}

function Card(props: { readonly children: JSX.Element }): JSX.Element {
  return (
    <div class="border border-gray-200 rounded-md p-4 bg-white">
      <h4 class="text-sm font-medium text-gray-700 mb-4 text-center">Geometry Preview</h4>
      <div class="w-full h-64 relative">{props.children}</div>
    </div>
  )
}

const BLUE = "#4F83ED"

export function RectanglePreview(props: { readonly width: number; readonly height: number; readonly depth: number }): JSX.Element {
  return (
    <Card>
      <Frame>
        <rect x={200 - props.width / 2} y={150 - props.height / 2} width={props.width} height={props.height} fill="none" stroke={BLUE} stroke-width="2" />
        <text x={200} y={150 + props.height / 2 + 20} font-size="12" fill={BLUE} text-anchor="middle">Depth: {props.depth}mm</text>
      </Frame>
    </Card>
  )
}

export function CirclePreview(props: { readonly radius: number; readonly depth: number }): JSX.Element {
  return (
    <Card>
      <Frame>
        <circle cx="200" cy="150" r={props.radius} fill="none" stroke={BLUE} stroke-width="2" />
        <text x={200} y={150 + props.radius + 20} font-size="12" fill={BLUE} text-anchor="middle">Depth: {props.depth}mm</text>
      </Frame>
    </Card>
  )
}

export function PolygonPreview(props: { readonly sides: number; readonly radius: number; readonly depth: number }): JSX.Element {
  const points = (): string =>
    Array.from({ length: props.sides }).map((_, i) => {
      const angle = i * ((2 * Math.PI) / props.sides)
      return `${200 + props.radius * Math.cos(angle)},${150 + props.radius * Math.sin(angle)}`
    }).join(" ")
  return (
    <Card>
      <Frame>
        <polygon points={points()} fill="none" stroke={BLUE} stroke-width="2" />
        <text x={200} y={150 + props.radius + 20} font-size="12" fill={BLUE} text-anchor="middle">Depth: {props.depth}mm</text>
      </Frame>
    </Card>
  )
}

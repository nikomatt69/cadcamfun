/** SVG icons of the Cycles panel (legacy `MachineCycles.tsx`), one per template. */
import type { JSX } from "solid-js"
import type { cam } from "@cadcamfun/core"

const DrillIcon = (): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-full h-full"
  >
    <path d="M14 4V20M8 4V7M8 12V15M4 4H20M4 20H20M12 12V15" />
  </svg>
)

const PocketIcon = (): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-full h-full"
  >
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="8" y="8" width="8" height="8" rx="1" />
  </svg>
)

const ContourIcon = (): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-full h-full"
  >
    <path d="M4 4v16M4 4h16M20 4v8a8 8 0 0 1-8 8H4" />
  </svg>
)

const TapIcon = (): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-full h-full"
  >
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="M8 6h8M8 10h8M10 14h4M7 18h10" />
  </svg>
)

export const CycleIcon = (props: { readonly class?: string }): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class={props.class}
  >
    <circle cx="12" cy="12" r="8" />
    <line x1="12" y1="4" x2="12" y2="12" />
    <line x1="12" y1="12" x2="16" y2="16" />
  </svg>
)

const DeepDrillIcon = (): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-full h-full"
  >
    <path d="M12 2v20M8 4v4M8 10v4M8 16v4M16 4v4M16 10v4M16 16v4M4 7h16M4 13h16M4 19h16" />
  </svg>
)

const SlotIcon = (): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-full h-full"
  >
    <path d="M4 8h16v8H4z" />
    <path d="M2 12h20" />
  </svg>
)

const BoringIcon = (): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-full h-full"
  >
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
    <line x1="12" y1="2" x2="12" y2="22" />
    <line x1="12" y1="5" x2="12" y2="19" stroke-width="4" />
  </svg>
)

const BackBoringIcon = (): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-full h-full"
  >
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4v16M9 8l6 8M9 16l6-8" />
  </svg>
)

const ThreadMillingIcon = (): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-full h-full"
  >
    <circle cx="12" cy="12" r="8" />
    <path d="M12 6v12M12 6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2M12 6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2" />
  </svg>
)

const CircularPocketIcon = (): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-full h-full"
  >
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 4a8 8 0 0 1 0 16 8 8 0 0 1 0-16z" />
  </svg>
)

const CircularIslandIcon = (): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-full h-full"
  >
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4" />
    <path d="M12 8a4 4 0 0 1 0 8 4 4 0 0 1 0-8z" />
  </svg>
)

const ChipBreakingIcon = (): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-full h-full"
  >
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="M12 5l-3 3M12 10l-3 3M12 15l-3 3M12 5l3 3M12 10l3 3M12 15l3 3" />
  </svg>
)

const TSlotIcon = (): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-full h-full"
  >
    <path d="M5 12h14M10 7v10M14 7v10M8 9v6M16 9v6" />
  </svg>
)

const CenterDrillIcon = (): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-full h-full"
  >
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="M8 9l4 4 4-4" />
  </svg>
)

const ChamferIcon = (): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-full h-full"
  >
    <rect x="4" y="4" width="16" height="16" />
    <path d="M4 4l4 4M20 4l-4 4" />
  </svg>
)

const PeckDrillIcon = (): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-full h-full"
  >
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="M12 6l-3 3M12 12l-3 3M12 18l-3 3" />
    <path d="M12 6l3 3M12 12l3 3M12 18l3 3" />
  </svg>
)

const PlungeMillingIcon = (): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="w-full h-full"
  >
    <circle cx="12" cy="12" r="2" />
    <path d="M12 8V4M8 12H4M16 12h4M12 16v4M8 8l-2-2M16 8l2-2M16 16l2 2M8 16l-2 2" />
  </svg>
)

export const cycleIcons: Record<cam.cycles.CycleIconName, () => JSX.Element> = {
  "drill": DrillIcon,
  "pocket": PocketIcon,
  "contour": ContourIcon,
  "tap": TapIcon,
  "deep-drill": DeepDrillIcon,
  "slot": SlotIcon,
  "boring": BoringIcon,
  "back-boring": BackBoringIcon,
  "thread-milling": ThreadMillingIcon,
  "circular-pocket": CircularPocketIcon,
  "circular-island": CircularIslandIcon,
  "chip-breaking": ChipBreakingIcon,
  "t-slot": TSlotIcon,
  "center-drill": CenterDrillIcon,
  "chamfer": ChamferIcon,
  "peck-drill": PeckDrillIcon,
  "plunge-milling": PlungeMillingIcon,
}

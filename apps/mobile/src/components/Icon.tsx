/**
 * SF-Symbol-style stroke icons. Each path is authored once and inherits `currentColor`, so a single
 * `color` CSS prop (or the parent text colour) drives every glyph in the app — exactly the way Apple's
 * SF Symbols behave.
 */
import type { JSX } from "solid-js"

type IconProps = JSX.SvgSVGAttributes<SVGSVGElement> & { readonly size?: number }

const wrap = (children: JSX.Element, size: number, props: JSX.SvgSVGAttributes<SVGSVGElement>): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    {...props}
  >
    {children}
  </svg>
)

export const ChevronLeft = (p: IconProps) => wrap(<polyline points="15 6 9 12 15 18" />, p.size ?? 20, p)
export const ChevronRight = (p: IconProps) => wrap(<polyline points="9 6 15 12 9 18" />, p.size ?? 20, p)
export const ChevronDown = (p: IconProps) => wrap(<polyline points="6 9 12 15 18 9" />, p.size ?? 20, p)
export const ChevronUp = (p: IconProps) => wrap(<polyline points="6 15 12 9 18 15" />, p.size ?? 20, p)

export const Check = (p: IconProps) => wrap(<polyline points="5 12 10 17 19 7" />, p.size ?? 20, p)
export const X = (p: IconProps) =>
  wrap(
    <>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </>,
    p.size ?? 20,
    p,
  )
export const Alert = (p: IconProps) =>
  wrap(
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="13" />
      <circle cx="12" cy="16.5" r="0.6" fill="currentColor" stroke="none" />
    </>,
    p.size ?? 20,
    p,
  )

export const Clock = (p: IconProps) =>
  wrap(
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 16 14" />
    </>,
    p.size ?? 20,
    p,
  )
export const Pulls = (p: IconProps) =>
  wrap(
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="12" r="2" />
      <path d="M6 8 v8" />
      <path d="M8 6 h6 a4 4 0 0 1 4 4 v0 a4 4 0 0 1 -4 4 h-2" />
    </>,
    p.size ?? 20,
    p,
  )
export const Bolt = (p: IconProps) =>
  wrap(<polygon points="13 3 5 14 11 14 9 21 19 9 13 9 13 3" />, p.size ?? 20, p)
export const Sparkle = (p: IconProps) =>
  wrap(
    <>
      <path d="M12 3 l1.8 4.2 L18 9 l-4.2 1.8 L12 15 l-1.8 -4.2 L6 9 l4.2 -1.8 Z" />
      <path d="M19 16 l0.8 1.9 L21.7 18.7 l-1.9 .8 L19 21.5 l-.8 -1.9 -1.9 -.8 1.9 -.8 Z" />
    </>,
    p.size ?? 20,
    p,
  )

export const Qr = (p: IconProps) =>
  wrap(
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <line x1="14" y1="14" x2="17" y2="14" />
      <line x1="21" y1="14" x2="21" y2="17" />
      <line x1="14" y1="21" x2="17" y2="21" />
      <line x1="21" y1="19" x2="21" y2="21" />
    </>,
    p.size ?? 20,
    p,
  )
export const Link = (p: IconProps) =>
  wrap(
    <>
      <path d="M10 14 a4 4 0 0 0 5.7 0 l3 -3 a4 4 0 1 0 -5.7 -5.7 l-1 1" />
      <path d="M14 10 a4 4 0 0 0 -5.7 0 l-3 3 a4 4 0 1 0 5.7 5.7 l1 -1" />
    </>,
    p.size ?? 20,
    p,
  )
export const Phone = (p: IconProps) =>
  wrap(
    <path d="M7 4 h-2 a2 2 0 0 0 -2 2 v0 a14 14 0 0 0 13 13 v0 a2 2 0 0 0 2 -2 v-2 l-4 -2 -2 2 a10 10 0 0 1 -5 -5 l2 -2 -2 -4 z" />,
    p.size ?? 20,
    p,
  )
export const Branch = (p: IconProps) =>
  wrap(
    <>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="9" r="2" />
      <line x1="6" y1="7" x2="6" y2="17" />
      <path d="M6 11 a4 4 0 0 0 4 4 h2" />
    </>,
    p.size ?? 20,
    p,
  )
export const Commit = (p: IconProps) =>
  wrap(
    <>
      <circle cx="12" cy="12" r="3" />
      <line x1="3" y1="12" x2="9" y2="12" />
      <line x1="15" y1="12" x2="21" y2="12" />
    </>,
    p.size ?? 20,
    p,
  )
export const Play = (p: IconProps) => wrap(<polygon points="7 5 19 12 7 19 7 5" />, p.size ?? 20, p)
export const Send = (p: IconProps) =>
  wrap(
    <>
      <path d="M4 12 l16 -8 -6 18 -3 -7 z" />
      <line x1="11" y1="15" x2="20" y2="4" />
    </>,
    p.size ?? 20,
    p,
  )
export const Refresh = (p: IconProps) =>
  wrap(
    <>
      <polyline points="3 12 6 9 9 12" />
      <path d="M6 9 v4 a6 6 0 0 0 11 2" />
      <polyline points="21 12 18 15 15 12" />
      <path d="M18 15 v-4 a6 6 0 0 0 -11 -2" />
    </>,
    p.size ?? 20,
    p,
  )

export const Unpair = (p: IconProps) =>
  wrap(
    <>
      <path d="M10 14 a4 4 0 0 0 5.7 0 l3 -3 a4 4 0 0 0 0 -5.7 l-1 -1" />
      <path d="M14 10 a4 4 0 0 0 -5.7 0 l-3 3 a4 4 0 0 0 0 5.7 l1 1" />
      <line x1="3" y1="3" x2="21" y2="21" />
    </>,
    p.size ?? 20,
    p,
  )
export const Merge = (p: IconProps) =>
  wrap(
    <>
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="6" cy="6" r="2" />
      <path d="M6 8 v8" />
      <path d="M8 6 h4 a4 4 0 0 1 4 4 v0 a4 4 0 0 1 -4 4 h-2" />
    </>,
    p.size ?? 20,
    p,
  )
export const Robot = (p: IconProps) =>
  wrap(
    <>
      <rect x="4" y="8" width="16" height="11" rx="3" />
      <circle cx="9" cy="13" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13" r="1" fill="currentColor" stroke="none" />
      <line x1="12" y1="3" x2="12" y2="8" />
      <circle cx="12" cy="3" r="1" fill="currentColor" stroke="none" />
    </>,
    p.size ?? 20,
    p,
  )
export const Person = (p: IconProps) =>
  wrap(
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21 a8 8 0 0 1 16 0" />
    </>,
    p.size ?? 20,
    p,
  )
export const Shield = (p: IconProps) =>
  wrap(<path d="M12 3 l8 3 v5 a9 9 0 0 1 -8 9 a9 9 0 0 1 -8 -9 V6 z" />, p.size ?? 20, p)
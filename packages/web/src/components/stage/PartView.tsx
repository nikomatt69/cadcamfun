// The bracket in the viewport: a grid, the extruded plate, two holes and the
// pocket with its offset passes. Shared by every scene that shows the part.

const PASSES = "M62 70h96v44H62z M72 78h76v28H72z M82 86h56v12H82z"

export function PartView({ pocket = false, path = false, className = "wb-svg" }: { pocket?: boolean; path?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 220 150" className={className} aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <g className="wb-grid">
        {Array.from({ length: 11 }, (_, i) => (
          <path key={`v${i}`} d={`M${i * 22} 0V150`} />
        ))}
        {Array.from({ length: 8 }, (_, i) => (
          <path key={`h${i}`} d={`M0 ${i * 22}H220`} />
        ))}
      </g>
      <path className="wb-side-face" d="M46 52l14-12h122l-14 12z M168 52l14-12v78l-14 12z" />
      <rect className="wb-top" x="46" y="52" width="122" height="78" rx="4" />
      <circle className="wb-hole" cx="60" cy="66" r="5" />
      <circle className="wb-hole" cx="154" cy="116" r="5" />
      <rect className="wb-pocket" x="62" y="70" width="96" height="44" rx="3" data-on={pocket || undefined} />
      <path className="wb-path" d={PASSES} pathLength={1} data-on={path || undefined} />
    </svg>
  )
}

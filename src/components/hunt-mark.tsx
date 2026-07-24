/**
 * The hunt mark: four corner brackets around a centre dot — a HUD lock.
 * Precision optics, not a literal animal. See DESIGN.md §1.
 */
export function HuntMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      className={className}
      aria-hidden="true"
    >
      <path d="M4 8 V4 H8" />
      <path d="M20 8 V4 H16" />
      <path d="M4 16 V20 H8" />
      <path d="M20 16 V20 H16" />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

"use client"

/**
 * Clean SVG vehicle schematics for the inspection damage map.
 *
 * Each view is drawn in a 0..100 x 0..100 user space (preserveAspectRatio none
 * is NOT used — we keep a fixed viewBox and let markers use percentage
 * coordinates that map 1:1 to this space). Line-art only, theme-aware via
 * currentColor, so it stays razor-sharp at any zoom and works for every vehicle.
 */

import type { MarkerView } from "@/lib/actions-inspections"

export const INSPECTION_VIEWS: { key: MarkerView; label: string }[] = [
  { key: "top", label: "Top" },
  { key: "front", label: "Front" },
  { key: "rear", label: "Rear" },
  { key: "left", label: "Left" },
  { key: "right", label: "Right" },
]

const stroke = {
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
  fill: "none",
}

function TopView() {
  return (
    <g className="text-foreground/70">
      {/* body outline */}
      <path {...stroke} d="M50 4 C64 4 72 12 74 26 L76 62 C76 84 68 96 50 96 C32 96 24 84 24 62 L26 26 C28 12 36 4 50 4 Z" />
      {/* windshield */}
      <path {...stroke} d="M36 24 C42 20 58 20 64 24 L61 38 C54 35 46 35 39 38 Z" />
      {/* rear window */}
      <path {...stroke} d="M39 70 C46 73 54 73 61 70 L63 82 C54 86 46 86 37 82 Z" />
      {/* roof panel */}
      <rect {...stroke} x="38" y="42" width="24" height="24" rx="4" />
      {/* mirrors */}
      <path {...stroke} d="M24 34 L18 32" />
      <path {...stroke} d="M76 34 L82 32" />
    </g>
  )
}

function SideView({ flip }: { flip?: boolean }) {
  return (
    <g className="text-foreground/70" transform={flip ? "translate(100,0) scale(-1,1)" : undefined}>
      {/* body */}
      <path {...stroke} d="M6 64 L10 46 C12 40 18 38 26 37 L40 28 C46 24 58 24 66 28 L80 37 C88 39 94 44 94 56 L94 64 C94 68 92 70 88 70 L84 70" />
      <path {...stroke} d="M6 64 L6 68 C6 70 8 70 12 70 L16 70" />
      <path {...stroke} d="M28 70 L72 70" />
      {/* greenhouse */}
      <path {...stroke} d="M30 37 L42 30 C48 27 58 27 64 30 L74 37 Z" />
      <path {...stroke} d="M52 29 L52 37" />
      {/* wheels */}
      <circle {...stroke} cx="24" cy="70" r="8" />
      <circle {...stroke} cx="76" cy="70" r="8" />
      <circle {...stroke} cx="24" cy="70" r="3" />
      <circle {...stroke} cx="76" cy="70" r="3" />
      {/* door line + handle */}
      <path {...stroke} d="M46 40 L46 66" />
      <path {...stroke} d="M40 47 L44 47" />
    </g>
  )
}

function FrontView() {
  return (
    <g className="text-foreground/70">
      <path {...stroke} d="M18 66 L20 44 C22 34 30 30 40 30 L60 30 C70 30 78 34 80 44 L82 66 C82 72 80 74 74 74 L26 74 C20 74 18 72 18 66 Z" />
      {/* windshield */}
      <path {...stroke} d="M32 44 C40 38 60 38 68 44 L66 54 L34 54 Z" />
      {/* hood line */}
      <path {...stroke} d="M28 58 L72 58" />
      {/* grille */}
      <rect {...stroke} x="42" y="62" width="16" height="6" rx="2" />
      {/* headlights */}
      <path {...stroke} d="M24 60 L34 60" />
      <path {...stroke} d="M66 60 L76 60" />
      {/* mirrors */}
      <path {...stroke} d="M18 48 L12 50" />
      <path {...stroke} d="M82 48 L88 50" />
    </g>
  )
}

function RearView() {
  return (
    <g className="text-foreground/70">
      <path {...stroke} d="M18 66 L20 46 C22 36 30 32 40 32 L60 32 C70 32 78 36 80 46 L82 66 C82 72 80 74 74 74 L26 74 C20 74 18 72 18 66 Z" />
      {/* rear window */}
      <path {...stroke} d="M32 46 C40 41 60 41 68 46 L66 55 L34 55 Z" />
      <path {...stroke} d="M28 60 L72 60" />
      {/* tail lights */}
      <rect {...stroke} x="24" y="62" width="12" height="6" rx="2" />
      <rect {...stroke} x="64" y="62" width="12" height="6" rx="2" />
      {/* plate */}
      <rect {...stroke} x="42" y="63" width="16" height="7" rx="1" />
    </g>
  )
}

export function VehicleSchematic({ view }: { view: MarkerView }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label={`${view} view schematic`}>
      {view === "top" && <TopView />}
      {view === "front" && <FrontView />}
      {view === "rear" && <RearView />}
      {view === "left" && <SideView />}
      {view === "right" && <SideView flip />}
    </svg>
  )
}

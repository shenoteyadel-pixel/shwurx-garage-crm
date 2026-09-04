"use client"

/**
 * Brand-neutral, body-type-aware vehicle schematics for the inspection damage map.
 *
 * Every view is drawn in a fixed 0..100 x 0..100 user space with line-art only
 * (theme-aware via currentColor), so it stays razor-sharp at any zoom and works
 * for every vehicle. The silhouette changes by body type (sedan, SUV, coupe,
 * hatchback, wagon, pickup, van, sports, convertible) while keeping the wheels
 * and ground line in the same place across types, so damage markers pinned by
 * percentage coordinates stay aligned regardless of body type.
 */

import type { MarkerView } from "@/lib/actions-inspections"
import { type BodyType, resolveBodyType } from "@/lib/body-type"

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

/* ------------------------------------------------------------------ */
/* Stance groups for front/rear (how tall/wide the vehicle sits)       */
/* ------------------------------------------------------------------ */

type Stance = "low" | "normal" | "tall"

const STANCE_BY_TYPE: Record<BodyType, Stance> = {
  sedan: "normal",
  hatchback: "normal",
  wagon: "normal",
  coupe: "low",
  sports: "low",
  convertible: "low",
  suv: "tall",
  pickup: "tall",
  van: "tall",
}

/* ------------------------------------------------------------------ */
/* Shared wheels (kept consistent so markers line up across types)     */
/* ------------------------------------------------------------------ */

function Wheels({ r = 8, cy = 70 }: { r?: number; cy?: number }) {
  return (
    <g className="text-foreground/70">
      <circle {...stroke} cx="26" cy={cy} r={r} />
      <circle {...stroke} cx="74" cy={cy} r={r} />
      <circle {...stroke} cx="26" cy={cy} r={r * 0.4} />
      <circle {...stroke} cx="74" cy={cy} r={r * 0.4} />
    </g>
  )
}

/* ------------------------------------------------------------------ */
/* SIDE views (front of vehicle at the left)                           */
/* ------------------------------------------------------------------ */

function SideBody({ bodyType }: { bodyType: BodyType }) {
  switch (bodyType) {
    case "suv":
      return (
        <>
          <path {...stroke} d="M6 60 L8 42 C9 36 14 33 22 32 L34 31 L40 22 C44 19 62 19 68 22 L74 31 L86 33 C92 35 94 40 94 50 L94 64 L6 64 Z" />
          {/* greenhouse */}
          <path {...stroke} d="M40 22 C44 19 62 19 68 22 L72 31 L38 31 Z" />
          <path {...stroke} d="M54 20 L54 31" />
          <path {...stroke} d="M40 34 L40 60" />
          <Wheels r={9} cy={69} />
        </>
      )
    case "pickup":
      return (
        <>
          {/* cab (front) + open bed (rear) */}
          <path {...stroke} d="M6 60 L8 46 C9 40 14 38 20 37 L30 36 L36 26 C40 23 52 23 56 26 L60 37 L62 40 L62 44 L92 44 C93 44 94 45 94 48 L94 64 L6 64 Z" />
          {/* cab greenhouse */}
          <path {...stroke} d="M36 26 C40 23 52 23 56 26 L58 37 L34 37 Z" />
          <path {...stroke} d="M46 24 L46 37" />
          {/* bed wall */}
          <path {...stroke} d="M62 44 L62 58 L92 58 L92 44" />
          <Wheels r={9} cy={69} />
        </>
      )
    case "van":
      return (
        <>
          <path {...stroke} d="M6 58 C6 40 8 22 16 20 L28 18 C40 17 74 17 84 20 C90 22 94 30 94 44 L94 64 L6 64 Z" />
          {/* windshield + side windows */}
          <path {...stroke} d="M12 30 C13 24 15 22 20 21 L26 32 Z" />
          <rect {...stroke} x="30" y="24" width="16" height="12" rx="2" />
          <rect {...stroke} x="50" y="24" width="16" height="12" rx="2" />
          <path {...stroke} d="M28 40 L28 60" />
          <Wheels r={8.5} cy={69} />
        </>
      )
    case "coupe":
      return (
        <>
          <path {...stroke} d="M6 60 L8 48 C10 42 16 40 24 39 L40 30 C46 26 58 26 66 31 L82 42 C90 44 94 48 94 56 L94 64 L6 64 Z" />
          {/* fastback greenhouse */}
          <path {...stroke} d="M32 39 L44 31 C50 28 58 28 64 32 L78 42 Z" />
          <path {...stroke} d="M52 29 L52 40" />
          <Wheels r={8.5} cy={69} />
        </>
      )
    case "sports":
      return (
        <>
          {/* very low, long hood, small cabin */}
          <path {...stroke} d="M4 62 L6 54 C9 49 18 47 30 46 L46 38 C52 35 60 35 66 39 L80 47 C90 49 96 52 96 58 L96 64 L4 64 Z" />
          <path {...stroke} d="M40 46 L48 39 C53 37 59 37 63 40 L74 47 Z" />
          <Wheels r={8.5} cy={69} />
        </>
      )
    case "convertible":
      return (
        <>
          {/* low, open top: windshield frame only, no roof */}
          <path {...stroke} d="M6 60 L8 48 C10 42 16 40 24 39 L42 38 L82 42 C90 44 94 48 94 56 L94 64 L6 64 Z" />
          {/* raked windshield frame */}
          <path {...stroke} d="M40 38 L48 30 L50 38" />
          {/* tonneau / cockpit line */}
          <path {...stroke} d="M40 40 L74 40" />
          <Wheels r={8.5} cy={69} />
        </>
      )
    case "hatchback":
      return (
        <>
          <path {...stroke} d="M6 60 L8 47 C10 41 16 39 24 38 L38 30 C44 26 58 26 66 30 L74 34 L80 38 L82 58 L82 64 L6 64 Z" />
          {/* greenhouse with near-vertical hatch */}
          <path {...stroke} d="M30 38 L40 31 C46 28 58 28 64 31 L76 37 L78 38 Z" />
          <path {...stroke} d="M52 29 L52 38" />
          <Wheels r={8.5} cy={69} />
        </>
      )
    case "wagon":
      return (
        <>
          <path {...stroke} d="M6 60 L8 47 C10 41 16 39 24 38 L38 30 C44 26 60 26 68 30 L84 34 C88 35 90 38 90 44 L90 64 L6 64 Z" />
          {/* long roof to the tail */}
          <path {...stroke} d="M30 38 L40 31 C46 28 60 28 68 31 L84 37 L86 38 Z" />
          <path {...stroke} d="M52 29 L52 38" />
          <Wheels r={8.5} cy={69} />
        </>
      )
    default: // sedan (neutral)
      return (
        <>
          <path {...stroke} d="M6 60 C6 54 9 51 15 50 L33 46 L43 33 C49 30 59 30 65 33 L80 45 L90 47 C93 48 94 51 94 56 L94 64 L6 64 Z" />
          {/* three-box greenhouse */}
          <path {...stroke} d="M35 46 L44 34 C50 31 58 31 64 34 L78 45 Z" />
          <path {...stroke} d="M52 32 L52 46" />
          <Wheels r={8.5} cy={69} />
        </>
      )
  }
}

/* ------------------------------------------------------------------ */
/* TOP views                                                           */
/* ------------------------------------------------------------------ */

function TopBody({ bodyType }: { bodyType: BodyType }) {
  if (bodyType === "pickup") {
    return (
      <g className="text-foreground/70">
        <path {...stroke} d="M50 5 C62 5 70 11 72 22 L74 90 C74 94 71 96 66 96 L34 96 C29 96 26 94 26 90 L28 22 C30 11 38 5 50 5 Z" />
        {/* cab windshield */}
        <path {...stroke} d="M36 22 C42 19 58 19 64 22 L62 34 C55 32 45 32 38 34 Z" />
        {/* cab roof */}
        <rect {...stroke} x="39" y="36" width="22" height="16" rx="3" />
        {/* bed */}
        <rect {...stroke} x="30" y="56" width="40" height="36" rx="3" />
      </g>
    )
  }
  if (bodyType === "van") {
    return (
      <g className="text-foreground/70">
        <rect {...stroke} x="26" y="6" width="48" height="88" rx="18" />
        {/* windshield */}
        <path {...stroke} d="M34 16 C42 12 58 12 66 16 L64 24 C56 21 44 21 36 24 Z" />
        {/* long roof panel */}
        <rect {...stroke} x="34" y="30" width="32" height="52" rx="4" />
      </g>
    )
  }
  if (bodyType === "suv") {
    return (
      <g className="text-foreground/70">
        <path {...stroke} d="M50 5 C64 5 72 12 74 24 L75 76 C75 90 68 95 50 95 C32 95 25 90 25 76 L26 24 C28 12 36 5 50 5 Z" />
        <path {...stroke} d="M35 24 C42 20 58 20 65 24 L62 36 C54 33 46 33 38 36 Z" />
        <rect {...stroke} x="37" y="38" width="26" height="34" rx="4" />
        <path {...stroke} d="M38 78 C46 81 54 81 62 78 L64 88 C55 91 45 91 36 88 Z" />
      </g>
    )
  }
  // car (sedan/coupe/sports/hatch/wagon/convertible)
  const roofH = bodyType === "coupe" || bodyType === "sports" || bodyType === "convertible" ? 20 : 24
  return (
    <g className="text-foreground/70">
      <path {...stroke} d="M50 4 C64 4 72 12 74 26 L76 62 C76 84 68 96 50 96 C32 96 24 84 24 62 L26 26 C28 12 36 4 50 4 Z" />
      {/* windshield */}
      <path {...stroke} d="M36 24 C42 20 58 20 64 24 L61 38 C54 35 46 35 39 38 Z" />
      {/* rear window */}
      <path {...stroke} d="M39 70 C46 73 54 73 61 70 L63 82 C54 86 46 86 37 82 Z" />
      {bodyType === "convertible" ? (
        // open cockpit instead of a roof panel
        <ellipse {...stroke} cx="50" cy={42 + roofH / 2} rx="12" ry={roofH / 2 + 2} />
      ) : (
        <rect {...stroke} x="38" y="42" width="24" height={roofH} rx="4" />
      )}
      <path {...stroke} d="M24 34 L18 32" />
      <path {...stroke} d="M76 34 L82 32" />
    </g>
  )
}

/* ------------------------------------------------------------------ */
/* FRONT / REAR views (by stance)                                      */
/* ------------------------------------------------------------------ */

function FrontBody({ stance, open }: { stance: Stance; open?: boolean }) {
  if (stance === "tall") {
    return (
      <g className="text-foreground/70">
        <path {...stroke} d="M14 68 L16 30 C16 22 22 18 32 18 L68 18 C78 18 84 22 84 30 L86 68 C86 73 84 74 78 74 L22 74 C16 74 14 73 14 68 Z" />
        <path {...stroke} d="M28 30 C40 24 60 24 72 30 L70 44 L30 44 Z" />
        <path {...stroke} d="M22 50 L78 50" />
        <rect {...stroke} x="42" y="54" width="16" height="8" rx="2" />
        <path {...stroke} d="M22 52 L34 52" />
        <path {...stroke} d="M66 52 L78 52" />
      </g>
    )
  }
  if (stance === "low") {
    return (
      <g className="text-foreground/70">
        <path {...stroke} d="M12 68 L14 50 C16 42 24 39 36 39 L64 39 C76 39 84 42 86 50 L88 68 C88 72 86 73 80 73 L20 73 C14 73 12 72 12 68 Z" />
        {!open && <path {...stroke} d="M30 50 C40 45 60 45 70 50 L68 58 L32 58 Z" />}
        {open && <path {...stroke} d="M34 50 L40 44 L60 44 L66 50" />}
        <path {...stroke} d="M20 62 L80 62" />
        <path {...stroke} d="M16 60 L28 60" />
        <path {...stroke} d="M72 60 L84 60" />
      </g>
    )
  }
  // normal
  return (
    <g className="text-foreground/70">
      <path {...stroke} d="M18 68 L20 44 C22 34 30 30 40 30 L60 30 C70 30 78 34 80 44 L82 68 C82 72 80 73 74 73 L26 73 C20 73 18 72 18 68 Z" />
      <path {...stroke} d="M32 44 C40 38 60 38 68 44 L66 54 L34 54 Z" />
      <path {...stroke} d="M28 58 L72 58" />
      <rect {...stroke} x="42" y="61" width="16" height="6" rx="2" />
      <path {...stroke} d="M24 60 L34 60" />
      <path {...stroke} d="M66 60 L76 60" />
      <path {...stroke} d="M18 48 L12 50" />
      <path {...stroke} d="M82 48 L88 50" />
    </g>
  )
}

function RearBody({ stance }: { stance: Stance }) {
  if (stance === "tall") {
    return (
      <g className="text-foreground/70">
        <path {...stroke} d="M14 68 L16 30 C16 22 22 18 32 18 L68 18 C78 18 84 22 84 30 L86 68 C86 73 84 74 78 74 L22 74 C16 74 14 73 14 68 Z" />
        <path {...stroke} d="M28 30 C40 25 60 25 72 30 L70 46 L30 46 Z" />
        <path {...stroke} d="M22 52 L78 52" />
        <rect {...stroke} x="22" y="54" width="12" height="8" rx="2" />
        <rect {...stroke} x="66" y="54" width="12" height="8" rx="2" />
        <rect {...stroke} x="42" y="55" width="16" height="7" rx="1" />
      </g>
    )
  }
  if (stance === "low") {
    return (
      <g className="text-foreground/70">
        <path {...stroke} d="M12 68 L14 50 C16 42 24 39 36 39 L64 39 C76 39 84 42 86 50 L88 68 C88 72 86 73 80 73 L20 73 C14 73 12 72 12 68 Z" />
        <path {...stroke} d="M30 50 C40 46 60 46 70 50 L68 57 L32 57 Z" />
        <path {...stroke} d="M18 61 L82 61" />
        <rect {...stroke} x="20" y="55" width="14" height="6" rx="2" />
        <rect {...stroke} x="66" y="55" width="14" height="6" rx="2" />
      </g>
    )
  }
  return (
    <g className="text-foreground/70">
      <path {...stroke} d="M18 68 L20 46 C22 36 30 32 40 32 L60 32 C70 32 78 36 80 46 L82 68 C82 72 80 73 74 73 L26 73 C20 73 18 72 18 68 Z" />
      <path {...stroke} d="M32 46 C40 41 60 41 68 46 L66 55 L34 55 Z" />
      <path {...stroke} d="M28 60 L72 60" />
      <rect {...stroke} x="24" y="62" width="12" height="6" rx="2" />
      <rect {...stroke} x="64" y="62" width="12" height="6" rx="2" />
      <rect {...stroke} x="42" y="63" width="16" height="7" rx="1" />
    </g>
  )
}

/* ------------------------------------------------------------------ */

export function VehicleSchematic({
  view,
  bodyType: bodyTypeRaw,
}: {
  view: MarkerView
  bodyType?: BodyType | string | null
}) {
  const bodyType = resolveBodyType(typeof bodyTypeRaw === "string" ? bodyTypeRaw : bodyTypeRaw ?? null)
  const stance = STANCE_BY_TYPE[bodyType]
  const open = bodyType === "convertible"

  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label={`${bodyType} ${view} view schematic`}>
      {view === "top" && <TopBody bodyType={bodyType} />}
      {view === "front" && <FrontBody stance={stance} open={open} />}
      {view === "rear" && <RearBody stance={stance} />}
      {(view === "left" || view === "right") && (
        <g transform={view === "right" ? "translate(100,0) scale(-1,1)" : undefined}>
          <SideBody bodyType={bodyType} />
        </g>
      )}
    </svg>
  )
}

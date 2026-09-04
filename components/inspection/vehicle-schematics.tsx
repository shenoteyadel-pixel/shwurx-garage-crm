"use client"

/**
 * Brand-neutral, body-type-aware vehicle schematics for the inspection damage map.
 *
 * FLAT 2D design (not 3D / not photoreal): every view is a clean, filled vector
 * diagram — the kind used on paper inspection and rental hand-over forms — drawn
 * in a fixed 0..100 x 0..100 user space so it stays razor-sharp at any zoom and
 * works for every vehicle. The silhouette changes by body type (sedan, SUV,
 * coupe, hatchback, wagon, pickup, van, sports, convertible) while keeping wheels
 * and the body centered consistently, so damage markers pinned by percentage
 * coordinates stay aligned regardless of body type. All colors are theme-aware
 * (currentColor), so it adapts to light/dark automatically.
 */

import type { MarkerView } from "@/lib/actions-inspections"
import { type BodyType, resolveBodyType } from "@/lib/body-type"
import { type VehicleProfile, resolveVehicleProfile } from "@/lib/vehicle"

export const INSPECTION_VIEWS: { key: MarkerView; label: string }[] = [
  { key: "top", label: "Top" },
  { key: "front", label: "Front" },
  { key: "rear", label: "Rear" },
  { key: "left", label: "Left" },
  { key: "right", label: "Right" },
]

/**
 * Photoreal 3D render sets (professional dark-studio look, brand-neutral) keyed
 * by the fine-grained VehicleProfile produced by the make/model resolver in
 * lib/vehicle.ts. Every profile has its own generated set (front/rear/side/top),
 * so a 911 shows a low sports body, a G-Class a boxy 4x4, a Q7 a large SUV, and
 * an S-Class a luxury sedan — no cross-brand mixups. Left/right reuse the single
 * side render (right is mirrored). resolveVehicleProfile always returns a valid
 * profile, so a render always exists; the vector line-art below is a safety net.
 */
const RENDER_SET: Record<VehicleProfile, string> = {
  sedan: "sedan",
  sedan_luxury: "sedan_luxury",
  coupe: "coupe",
  sports: "sports",
  hatchback: "hatchback",
  wagon: "wagon",
  suv: "suv",
  suv_large: "suv_large",
  suv_boxy: "suv_boxy",
  pickup: "pickup",
  van: "van",
  convertible: "convertible",
}

/** File name (within the render set) for each inspection view. */
const RENDER_VIEW_FILE: Record<MarkerView, string> = {
  top: "top",
  front: "front",
  rear: "rear",
  left: "side",
  right: "side",
}

function renderSrc(profile: VehicleProfile, view: MarkerView): string | null {
  const set = RENDER_SET[profile]
  if (!set) return null
  return `/inspection/renders/${set}/${RENDER_VIEW_FILE[view]}.png`
}

/* Flat fill + outline for the car body panels */
const body = {
  fill: "currentColor",
  fillOpacity: 0.1,
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
}
/* Glass areas: slightly darker flat fill */
const glass = {
  fill: "currentColor",
  fillOpacity: 0.22,
  stroke: "currentColor",
  strokeOpacity: 0.5,
  strokeWidth: 1,
  strokeLinejoin: "round" as const,
}
/* Thin panel / detail lines */
const line = {
  fill: "none",
  stroke: "currentColor",
  strokeOpacity: 0.45,
  strokeWidth: 1,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
}
/* Wheels / tyres (solid flat) */
const tyre = {
  fill: "currentColor",
  fillOpacity: 0.32,
  stroke: "currentColor",
  strokeWidth: 1.2,
  strokeLinejoin: "round" as const,
}

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
/* SIDE views (front of vehicle at the left)                           */
/* ------------------------------------------------------------------ */

function SideWheels({ cy = 72, r = 9 }: { cy?: number; r?: number }) {
  return (
    <g>
      <circle {...tyre} cx="27" cy={cy} r={r} />
      <circle {...tyre} cx="73" cy={cy} r={r} />
      <circle {...body} fillOpacity={0.02} cx="27" cy={cy} r={r * 0.45} />
      <circle {...body} fillOpacity={0.02} cx="73" cy={cy} r={r * 0.45} />
    </g>
  )
}

function SideBody({ bodyType }: { bodyType: BodyType }) {
  switch (bodyType) {
    case "suv":
      return (
        <g>
          <path
            {...body}
            d="M8 68 L9 42 C10 35 15 32 23 31 L35 30 L42 21 C46 18 62 18 68 21 L76 30 L88 33 C93 35 93 41 93 50 L93 66 C93 68 92 69 89 69 L12 69 C9 69 8 69 8 68 Z"
          />
          <path {...glass} d="M42 22 C46 19 62 19 67 22 L73 30 L38 30 Z" />
          <path {...line} d="M55 20 L55 30" />
          <path {...line} d="M41 33 L41 65" />
          <path {...line} d="M69 33 L69 65" />
          <SideWheels cy={70} r={9.5} />
        </g>
      )
    case "pickup":
      return (
        <g>
          <path
            {...body}
            d="M8 68 L9 47 C10 41 15 39 21 38 L31 37 L37 26 C41 23 53 23 57 26 L61 38 L63 42 L92 42 C93 42 93 44 93 47 L93 66 C93 68 92 69 89 69 L12 69 C9 69 8 69 8 68 Z"
          />
          <path {...glass} d="M37 27 C41 24 52 24 56 27 L59 37 L35 37 Z" />
          <path {...line} d="M47 25 L47 37" />
          <path {...line} d="M63 46 L63 60 L92 60 L92 46" />
          <SideWheels cy={70} r={9.5} />
        </g>
      )
    case "van":
      return (
        <g>
          <path
            {...body}
            d="M8 66 C8 42 10 22 18 20 L30 18 C42 17 74 17 84 20 C90 22 93 31 93 45 L93 66 C93 68 92 69 89 69 L12 69 C9 69 8 68 8 66 Z"
          />
          <path {...glass} d="M13 32 C14 25 16 22 21 21 L28 33 Z" />
          <rect {...glass} x="32" y="24" width="16" height="12" rx="2" />
          <rect {...glass} x="52" y="24" width="16" height="12" rx="2" />
          <path {...line} d="M30 39 L30 65" />
          <path {...line} d="M50 39 L50 65" />
          <SideWheels cy={70} r={9} />
        </g>
      )
    case "coupe":
      return (
        <g>
          <path
            {...body}
            d="M6 66 L8 49 C10 43 16 41 24 40 L41 30 C47 26 59 26 67 31 L83 43 C90 45 94 49 94 57 L94 66 C94 68 93 68 90 68 L10 68 C7 68 6 68 6 66 Z"
          />
          <path {...glass} d="M32 40 L45 31 C51 28 59 28 65 32 L79 43 Z" />
          <path {...line} d="M53 29 L53 41" />
          <path {...line} d="M42 42 L42 66" />
          <SideWheels cy={69} r={9} />
        </g>
      )
    case "sports":
      return (
        <g>
          <path
            {...body}
            d="M4 66 L6 55 C9 50 18 48 31 47 L47 38 C53 35 61 35 67 39 L81 47 C91 49 96 53 96 59 L96 66 C96 68 95 68 92 68 L8 68 C5 68 4 68 4 66 Z"
          />
          <path {...glass} d="M41 47 L49 39 C54 37 60 37 64 40 L75 47 Z" />
          <path {...line} d="M43 48 L43 66" />
          <SideWheels cy={69} r={9} />
        </g>
      )
    case "convertible":
      return (
        <g>
          <path
            {...body}
            d="M6 66 L8 49 C10 43 16 41 24 40 L44 39 L83 43 C90 45 94 49 94 57 L94 66 C94 68 93 68 90 68 L10 68 C7 68 6 68 6 66 Z"
          />
          <path {...line} strokeOpacity={0.7} d="M41 39 L49 31 L51 39" />
          <path {...line} d="M41 41 L75 41" />
          <SideWheels cy={69} r={9} />
        </g>
      )
    case "hatchback":
      return (
        <g>
          <path
            {...body}
            d="M8 66 L9 47 C11 41 17 39 25 38 L39 30 C45 26 59 26 67 30 L75 34 L82 39 L83 66 C83 68 82 68 79 68 L11 68 C8 68 8 68 8 66 Z"
          />
          <path {...glass} d="M31 38 L41 31 C47 28 59 28 65 31 L77 37 L79 38 Z" />
          <path {...line} d="M53 29 L53 38" />
          <path {...line} d="M42 40 L42 66" />
          <SideWheels cy={70} r={9} />
        </g>
      )
    case "wagon":
      return (
        <g>
          <path
            {...body}
            d="M8 66 L9 47 C11 41 17 39 25 38 L39 30 C45 26 61 26 69 30 L85 34 C89 35 91 38 91 44 L91 66 C91 68 90 68 87 68 L11 68 C8 68 8 68 8 66 Z"
          />
          <path {...glass} d="M31 38 L41 31 C47 28 61 28 69 31 L85 37 L87 38 Z" />
          <path {...line} d="M53 29 L53 38" />
          <path {...line} d="M42 40 L42 66" />
          <SideWheels cy={70} r={9} />
        </g>
      )
    default: // sedan (neutral)
      return (
        <g>
          <path
            {...body}
            d="M7 66 C7 55 10 52 16 51 L34 47 L44 33 C50 30 60 30 66 33 L81 46 L90 48 C93 49 94 52 94 57 L94 66 C94 68 93 68 90 68 L10 68 C7 68 7 68 7 66 Z"
          />
          <path {...glass} d="M36 47 L45 34 C51 31 59 31 65 34 L79 46 Z" />
          <path {...line} d="M53 32 L53 47" />
          <path {...line} d="M43 48 L43 66" />
          <SideWheels cy={70} r={9} />
        </g>
      )
  }
}

/* ------------------------------------------------------------------ */
/* TOP views                                                           */
/* ------------------------------------------------------------------ */

function TopBody({ bodyType }: { bodyType: BodyType }) {
  if (bodyType === "pickup") {
    return (
      <g>
        <path
          {...body}
          d="M50 5 C62 5 70 11 72 22 L74 90 C74 94 71 96 66 96 L34 96 C29 96 26 94 26 90 L28 22 C30 11 38 5 50 5 Z"
        />
        <path {...glass} d="M36 22 C42 19 58 19 64 22 L62 34 C55 32 45 32 38 34 Z" />
        <rect {...glass} x="39" y="36" width="22" height="15" rx="3" />
        <rect {...line} x="30" y="56" width="40" height="36" rx="3" />
        <path {...line} d="M50 56 L50 92" />
      </g>
    )
  }
  if (bodyType === "van") {
    return (
      <g>
        <rect {...body} x="26" y="6" width="48" height="88" rx="18" />
        <path {...glass} d="M34 16 C42 12 58 12 66 16 L64 24 C56 21 44 21 36 24 Z" />
        <rect {...glass} x="34" y="30" width="32" height="52" rx="4" />
        <path {...line} d="M50 30 L50 82" />
      </g>
    )
  }
  if (bodyType === "suv") {
    return (
      <g>
        <path
          {...body}
          d="M50 5 C64 5 72 12 74 24 L75 76 C75 90 68 95 50 95 C32 95 25 90 25 76 L26 24 C28 12 36 5 50 5 Z"
        />
        <path {...glass} d="M35 24 C42 20 58 20 65 24 L62 36 C54 33 46 33 38 36 Z" />
        <rect {...glass} x="37" y="38" width="26" height="34" rx="4" />
        <path {...glass} d="M38 78 C46 81 54 81 62 78 L64 88 C55 91 45 91 36 88 Z" />
        <path {...line} d="M50 38 L50 72" />
      </g>
    )
  }
  // car (sedan / coupe / sports / hatch / wagon / convertible)
  const isLow = bodyType === "coupe" || bodyType === "sports" || bodyType === "convertible"
  const roofH = isLow ? 20 : 24
  return (
    <g>
      <path
        {...body}
        d="M50 4 C64 4 72 12 74 26 L76 62 C76 84 68 96 50 96 C32 96 24 84 24 62 L26 26 C28 12 36 4 50 4 Z"
      />
      <path {...glass} d="M36 24 C42 20 58 20 64 24 L61 38 C54 35 46 35 39 38 Z" />
      <path {...glass} d="M39 70 C46 73 54 73 61 70 L63 82 C54 86 46 86 37 82 Z" />
      {bodyType === "convertible" ? (
        <ellipse {...glass} cx="50" cy={42 + roofH / 2} rx="12" ry={roofH / 2 + 2} />
      ) : (
        <rect {...glass} x="38" y="42" width="24" height={roofH} rx="4" />
      )}
      <path {...line} d="M24 40 L18 38" />
      <path {...line} d="M76 40 L82 38" />
      <path {...line} d="M24 58 L18 60" />
      <path {...line} d="M76 58 L82 60" />
    </g>
  )
}

/* ------------------------------------------------------------------ */
/* FRONT / REAR views (by stance)                                      */
/* ------------------------------------------------------------------ */

function FrontBody({ stance, open }: { stance: Stance; open?: boolean }) {
  if (stance === "tall") {
    return (
      <g>
        <path
          {...body}
          d="M14 72 L16 30 C16 22 22 18 32 18 L68 18 C78 18 84 22 84 30 L86 72 C86 74 85 75 81 75 L19 75 C15 75 14 74 14 72 Z"
        />
        <path {...glass} d="M28 30 C40 24 60 24 72 30 L70 44 L30 44 Z" />
        <path {...line} d="M22 50 L78 50" />
        <rect {...line} x="42" y="55" width="16" height="9" rx="2" />
        <rect {...glass} x="20" y="52" width="12" height="6" rx="1.5" />
        <rect {...glass} x="68" y="52" width="12" height="6" rx="1.5" />
        <path {...line} d="M18 72 L82 72" />
      </g>
    )
  }
  if (stance === "low") {
    return (
      <g>
        <path
          {...body}
          d="M12 72 L14 50 C16 42 24 39 36 39 L64 39 C76 39 84 42 86 50 L88 72 C88 74 87 74 83 74 L17 74 C13 74 12 73 12 72 Z"
        />
        {!open && <path {...glass} d="M30 50 C40 45 60 45 70 50 L68 58 L32 58 Z" />}
        {open && <path {...line} strokeOpacity={0.7} d="M34 50 L40 44 L60 44 L66 50" />}
        <path {...line} d="M20 63 L80 63" />
        <rect {...glass} x="16" y="60" width="12" height="6" rx="1.5" />
        <rect {...glass} x="72" y="60" width="12" height="6" rx="1.5" />
      </g>
    )
  }
  // normal
  return (
    <g>
      <path
        {...body}
        d="M18 72 L20 44 C22 34 30 30 40 30 L60 30 C70 30 78 34 80 44 L82 72 C82 74 81 74 77 74 L23 74 C19 74 18 73 18 72 Z"
      />
      <path {...glass} d="M32 44 C40 38 60 38 68 44 L66 54 L34 54 Z" />
      <path {...line} d="M28 58 L72 58" />
      <rect {...line} x="42" y="61" width="16" height="7" rx="2" />
      <rect {...glass} x="24" y="59" width="11" height="5" rx="1.5" />
      <rect {...glass} x="65" y="59" width="11" height="5" rx="1.5" />
      <path {...line} d="M18 72 L82 72" />
    </g>
  )
}

function RearBody({ stance }: { stance: Stance }) {
  if (stance === "tall") {
    return (
      <g>
        <path
          {...body}
          d="M14 72 L16 30 C16 22 22 18 32 18 L68 18 C78 18 84 22 84 30 L86 72 C86 74 85 75 81 75 L19 75 C15 75 14 74 14 72 Z"
        />
        <path {...glass} d="M28 30 C40 25 60 25 72 30 L70 46 L30 46 Z" />
        <path {...line} d="M22 52 L78 52" />
        <rect {...line} x="22" y="54" width="12" height="9" rx="1.5" />
        <rect {...line} x="66" y="54" width="12" height="9" rx="1.5" />
        <rect {...line} x="42" y="56" width="16" height="7" rx="1" />
        <path {...line} d="M18 72 L82 72" />
      </g>
    )
  }
  if (stance === "low") {
    return (
      <g>
        <path
          {...body}
          d="M12 72 L14 50 C16 42 24 39 36 39 L64 39 C76 39 84 42 86 50 L88 72 C88 74 87 74 83 74 L17 74 C13 74 12 73 12 72 Z"
        />
        <path {...glass} d="M30 50 C40 46 60 46 70 50 L68 57 L32 57 Z" />
        <path {...line} d="M18 62 L82 62" />
        <rect {...line} x="20" y="55" width="14" height="7" rx="2" />
        <rect {...line} x="66" y="55" width="14" height="7" rx="2" />
      </g>
    )
  }
  return (
    <g>
      <path
        {...body}
        d="M18 72 L20 46 C22 36 30 32 40 32 L60 32 C70 32 78 36 80 46 L82 72 C82 74 81 74 77 74 L23 74 C19 74 18 73 18 72 Z"
      />
      <path {...glass} d="M32 46 C40 41 60 41 68 46 L66 55 L34 55 Z" />
      <path {...line} d="M28 60 L72 60" />
      <rect {...line} x="24" y="62" width="12" height="7" rx="2" />
      <rect {...line} x="64" y="62" width="12" height="7" rx="2" />
      <rect {...line} x="42" y="63" width="16" height="7" rx="1" />
      <path {...line} d="M18 72 L82 72" />
    </g>
  )
}

/* ------------------------------------------------------------------ */

export function VehicleSchematic({
  view,
  make,
  model,
  profile: profileProp,
  bodyType: bodyTypeRaw,
  forceSchematic,
}: {
  view: MarkerView
  /** Vehicle make (e.g. "Porsche") — used to resolve the model-accurate profile. */
  make?: string | null
  /** Vehicle model (e.g. "911") — used to resolve the model-accurate profile. */
  model?: string | null
  /** Pre-resolved profile; overrides make/model/bodyType resolution when given. */
  profile?: VehicleProfile
  /** Legacy body-type hint, used as a fallback when make/model are unknown. */
  bodyType?: BodyType | string | null
  /**
   * Force the flat vector line-art instead of the photoreal render. Used on the
   * printed report, where the dark studio renders would print as dark boxes on
   * white paper; the line diagram is the correct look for a paper form.
   */
  forceSchematic?: boolean
}) {
  const bodyType = resolveBodyType(typeof bodyTypeRaw === "string" ? bodyTypeRaw : bodyTypeRaw ?? null)
  const stance = STANCE_BY_TYPE[bodyType]
  const open = bodyType === "convertible"

  // Resolve the fine-grained profile from make/model (falling back to the body
  // type), then pick the matching photoreal render set. The right side reuses
  // the (front-left-facing) side render, mirrored.
  const profile =
    profileProp ?? resolveVehicleProfile(make ?? null, model ?? null, typeof bodyTypeRaw === "string" ? bodyTypeRaw : null)
  const src = forceSchematic ? null : renderSrc(profile, view)
  if (src) {
    return (
      <img
        src={src || "/placeholder.svg"}
        alt={`${profile} ${view} view`}
        draggable={false}
        className="h-full w-full object-contain"
        style={view === "right" ? { transform: "scaleX(-1)" } : undefined}
      />
    )
  }

  return (
    <svg
      viewBox="0 0 100 100"
      className="h-full w-full text-foreground/80"
      role="img"
      aria-label={`${bodyType} ${view} view schematic`}
    >
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

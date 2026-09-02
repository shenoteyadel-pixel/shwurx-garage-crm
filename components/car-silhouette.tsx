import { type VehicleProfile, resolvePaint, shade } from "@/lib/vehicle"
import { cn } from "@/lib/utils"

/**
 * Parametric side-profile car renderer.
 *
 * Each VehicleProfile is described by a small set of proportions (overhangs,
 * hood/roof heights, greenhouse position, rear style, wheel size/placement).
 * A single builder turns those numbers into an SVG path, so every profile is
 * visibly distinct (compact sedan vs. boxy G-wagon vs. low sports coupe) while
 * staying crisp at any size and fully recolorable from the job's paint color.
 *
 * ViewBox: 0 0 248 120, ground line at y = 104.
 */

type Rear = "notch" | "fast" | "box" | "bed"

interface Proto {
  fx: number // front bumper x
  rx: number // rear bumper x
  bottom: number // body underside y
  noseY: number // top of front bumper/grille y
  hoodY: number // hood top y
  roofY: number // roof top y
  cowlX: number // windshield base x (hood → glass)
  rfX: number // roof front x
  rbX: number // roof back x
  deckX: number // rear glass base x (for notch)
  deckY: number // rear deck / fastback tail y
  rear: Rear
  wR: number // wheel radius
  ax1: number // front axle x
  ax2: number // rear axle x
  round?: number // corner rounding for pillars (0 = sharp/boxy)
}

const P: Record<VehicleProfile, Proto> = {
  sedan: {
    fx: 24, rx: 224, bottom: 90, noseY: 74, hoodY: 63, roofY: 43,
    cowlX: 98, rfX: 122, rbX: 166, deckX: 190, deckY: 61, rear: "notch",
    wR: 19, ax1: 66, ax2: 182, round: 7,
  },
  sedan_luxury: {
    fx: 18, rx: 230, bottom: 90, noseY: 72, hoodY: 61, roofY: 41,
    cowlX: 96, rfX: 124, rbX: 178, deckX: 204, deckY: 57, rear: "notch",
    wR: 19, ax1: 62, ax2: 192, round: 9,
  },
  coupe: {
    fx: 24, rx: 222, bottom: 90, noseY: 74, hoodY: 63, roofY: 45,
    cowlX: 102, rfX: 126, rbX: 156, deckX: 196, deckY: 74, rear: "fast",
    wR: 19, ax1: 66, ax2: 180, round: 10,
  },
  sports: {
    fx: 20, rx: 228, bottom: 88, noseY: 82, hoodY: 72, roofY: 54,
    cowlX: 98, rfX: 120, rbX: 152, deckX: 208, deckY: 80, rear: "fast",
    wR: 20, ax1: 62, ax2: 188, round: 12,
  },
  hatchback: {
    fx: 28, rx: 202, bottom: 90, noseY: 72, hoodY: 61, roofY: 43,
    cowlX: 98, rfX: 120, rbX: 160, deckX: 196, deckY: 66, rear: "fast",
    wR: 18, ax1: 64, ax2: 168, round: 7,
  },
  wagon: {
    fx: 24, rx: 226, bottom: 90, noseY: 72, hoodY: 61, roofY: 42,
    cowlX: 100, rfX: 122, rbX: 200, deckX: 214, deckY: 46, rear: "box",
    wR: 19, ax1: 66, ax2: 184, round: 5,
  },
  suv: {
    fx: 24, rx: 222, bottom: 92, noseY: 60, hoodY: 51, roofY: 29,
    cowlX: 100, rfX: 120, rbX: 178, deckX: 210, deckY: 33, rear: "box",
    wR: 21, ax1: 66, ax2: 180, round: 5,
  },
  suv_large: {
    fx: 18, rx: 230, bottom: 92, noseY: 58, hoodY: 49, roofY: 27,
    cowlX: 98, rfX: 116, rbX: 192, deckX: 220, deckY: 31, rear: "box",
    wR: 22, ax1: 62, ax2: 192, round: 4,
  },
  suv_boxy: {
    fx: 26, rx: 224, bottom: 92, noseY: 54, hoodY: 46, roofY: 25,
    cowlX: 110, rfX: 118, rbX: 200, deckX: 214, deckY: 27, rear: "box",
    wR: 22, ax1: 66, ax2: 184, round: 1,
  },
  pickup: {
    fx: 22, rx: 232, bottom: 92, noseY: 62, hoodY: 53, roofY: 33,
    cowlX: 84, rfX: 102, rbX: 138, deckX: 138, deckY: 53, rear: "bed",
    wR: 20, ax1: 60, ax2: 194, round: 4,
  },
  van: {
    fx: 20, rx: 226, bottom: 94, noseY: 54, hoodY: 46, roofY: 23,
    cowlX: 68, rfX: 92, rbX: 214, deckX: 220, deckY: 25, rear: "box",
    wR: 18, ax1: 58, ax2: 196, round: 3,
  },
  convertible: {
    fx: 24, rx: 222, bottom: 90, noseY: 74, hoodY: 63, roofY: 52,
    cowlX: 104, rfX: 122, rbX: 150, deckX: 196, deckY: 66, rear: "notch",
    wR: 19, ax1: 66, ax2: 180, round: 8,
  },
}

function buildBody(p: Proto): string {
  const r = p.round ?? 6
  const d: string[] = []
  // front bumper bottom → up the front face
  d.push(`M ${p.fx} ${p.bottom}`)
  d.push(`L ${p.fx} ${p.noseY}`)
  // round hood front corner, run the hood back to the cowl
  d.push(`Q ${p.fx} ${p.hoodY} ${p.fx + 12} ${p.hoodY}`)
  d.push(`L ${p.cowlX} ${p.hoodY}`)
  // windshield up to roof front (rounded at the roof edge)
  d.push(`Q ${p.rfX - 6} ${p.roofY} ${p.rfX} ${p.roofY}`)
  // roof
  d.push(`L ${p.rbX} ${p.roofY}`)
  // rear treatment
  if (p.rear === "notch") {
    d.push(`Q ${p.rbX + r} ${p.roofY} ${p.deckX} ${p.deckY}`) // C-pillar / rear glass
    d.push(`L ${p.rx} ${p.deckY}`) // trunk lid
    d.push(`L ${p.rx} ${p.bottom}`) // rear face
  } else if (p.rear === "fast") {
    d.push(`Q ${p.rbX + (p.rx - p.rbX) * 0.5} ${p.roofY + (p.deckY - p.roofY) * 0.35} ${p.rx} ${p.deckY}`) // fastback sweep
    d.push(`L ${p.rx} ${p.bottom}`)
  } else if (p.rear === "box") {
    d.push(`L ${p.deckX} ${p.roofY}`) // small roof overhang
    d.push(`Q ${p.rx} ${p.roofY + r} ${p.rx} ${p.roofY + r + 8}`) // near-vertical rear, slight round at top
    d.push(`L ${p.rx} ${p.bottom}`)
  } else {
    // pickup: cab back drops to bed rail, bed runs to the tailgate
    d.push(`L ${p.rbX} ${p.hoodY}`) // rear of cab down to bed-rail height
    d.push(`L ${p.rx} ${p.hoodY}`) // bed rail
    d.push(`L ${p.rx} ${p.bottom}`) // tailgate
  }
  d.push("Z")
  return d.join(" ")
}

function buildGlass(p: Proto): string[] {
  const inset = 5
  const topY = p.roofY + inset
  const baseY = p.hoodY - 3
  const frontBaseX = p.cowlX + 6
  const frontTopX = p.rfX + inset
  const backTopX = p.rbX - inset

  if (p.rear === "bed") {
    // single cab greenhouse
    return [
      `M ${frontBaseX} ${baseY} L ${frontTopX} ${topY} L ${backTopX} ${topY} L ${p.rbX - 4} ${baseY} Z`,
    ]
  }

  let backBaseX: number
  let backBaseY: number
  if (p.rear === "notch") {
    backBaseX = p.deckX - 6
    backBaseY = p.deckY - 3
  } else if (p.rear === "box") {
    backBaseX = p.rx - 10
    backBaseY = p.hoodY - 3
  } else {
    // fast
    backBaseX = p.rx - 14
    backBaseY = p.deckY - 4
  }

  // B-pillar split roughly at greenhouse midpoint for a two-window look
  const midX = (frontTopX + backTopX) / 2
  const front = `M ${frontBaseX} ${baseY} L ${frontTopX} ${topY} L ${midX - 3} ${topY} L ${midX - 3} ${baseY} Z`
  const rear = `M ${midX + 3} ${baseY} L ${midX + 3} ${topY} L ${backTopX} ${topY} L ${backBaseX} ${backBaseY} Z`
  return [front, rear]
}

function Wheel({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      {/* tyre */}
      <circle cx={cx} cy={cy} r={r} fill="#111318" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#000" strokeOpacity={0.6} strokeWidth={2} />
      {/* rim */}
      <circle cx={cx} cy={cy} r={r * 0.54} fill="#20242b" />
      <circle cx={cx} cy={cy} r={r * 0.54} fill="none" stroke="#5b636e" strokeWidth={1.5} />
      {/* spokes */}
      {Array.from({ length: 5 }).map((_, i) => {
        const a = (i / 5) * Math.PI * 2
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + Math.cos(a) * r * 0.5}
            y2={cy + Math.sin(a) * r * 0.5}
            stroke="#79828f"
            strokeWidth={2}
            strokeLinecap="round"
          />
        )
      })}
      <circle cx={cx} cy={cy} r={r * 0.14} fill="#8b95a3" />
    </g>
  )
}

export function CarSilhouette({
  profile,
  color,
  className,
  title,
}: {
  profile: VehicleProfile
  color?: string | null
  className?: string
  title?: string
}) {
  const p = P[profile] ?? P.sedan
  const { paint, isLight } = resolvePaint(color)
  const dark = shade(paint, -0.34)
  const light = shade(paint, 0.3)
  const outline = isLight ? "rgba(0,0,0,0.4)" : shade(paint, -0.58)
  const wheelCY = p.bottom
  const uid = `${profile}-${paint.replace("#", "")}`

  const body = buildBody(p)
  const glass = buildGlass(p)

  return (
    <svg
      viewBox="0 0 248 120"
      className={cn("h-full w-full", className)}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={title || `${profile} vehicle`}
    >
      <defs>
        <linearGradient id={`paint-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={light} />
          <stop offset="50%" stopColor={paint} />
          <stop offset="100%" stopColor={dark} />
        </linearGradient>
      </defs>

      {/* ground shadow */}
      <ellipse cx="126" cy={p.bottom + 12} rx="108" ry="7" fill="#000" opacity={0.3} />

      {/* wheel arches (behind body, read as cut-outs) */}
      {[p.ax1, p.ax2].map((cx, i) => (
        <circle key={i} cx={cx} cy={wheelCY} r={p.wR + 3} fill={shade(paint, -0.62)} />
      ))}

      {/* body */}
      <path d={body} fill={`url(#paint-${uid})`} stroke={outline} strokeWidth={2.2} strokeLinejoin="round" />

      {/* beltline highlight */}
      <path
        d={`M ${p.fx + 14} ${p.hoodY + 3} L ${p.rx - 10} ${p.hoodY + 3}`}
        fill="none"
        stroke={light}
        strokeOpacity={0.45}
        strokeWidth={1.5}
      />

      {/* glass */}
      {glass.map((g, i) => (
        <path key={i} d={g} fill="#0c1119" opacity={0.85} stroke={shade(paint, -0.48)} strokeWidth={1} />
      ))}
      {glass.map((g, i) => (
        <path key={`hl-${i}`} d={g} fill="none" stroke="#a9bdd6" strokeOpacity={0.22} strokeWidth={1} />
      ))}

      {/* door line */}
      <line
        x1={(p.ax1 + p.ax2) / 2}
        y1={p.hoodY + 4}
        x2={(p.ax1 + p.ax2) / 2}
        y2={p.bottom - 4}
        stroke={outline}
        strokeOpacity={0.4}
        strokeWidth={1}
      />

      {/* headlight + taillight accents */}
      <circle cx={p.fx + 6} cy={p.noseY - 4} r={2.4} fill="#eef3ff" opacity={0.85} />
      <rect x={p.rx - 8} y={(p.rear === "box" ? p.roofY + 14 : p.deckY + 2)} width={5} height={6} rx={1.5} fill="#e2402f" opacity={0.85} />

      {/* wheels */}
      <Wheel cx={p.ax1} cy={wheelCY} r={p.wR} />
      <Wheel cx={p.ax2} cy={wheelCY} r={p.wR} />
    </svg>
  )
}

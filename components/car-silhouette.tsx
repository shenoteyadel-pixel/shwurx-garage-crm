import { type BodyType, resolvePaint, shade } from "@/lib/vehicle"
import { cn } from "@/lib/utils"

// Side-profile geometry per body type. Colorable, rendered as inline SVG so it
// reacts to the job's paint color and scales crisply at any card size.
interface Shape {
  body: string
  glass: string[]
  wheels: { cx: number; r: number }[]
  wheelCY: number
  belt?: string // optional beltline / door accent
}

const SHAPES: Record<BodyType, Shape> = {
  sedan: {
    body:
      "M26,90 L26,66 Q28,58 44,57 L96,55 L118,40 Q123,35 134,35 L166,36 Q178,37 184,46 L198,56 L214,60 Q224,62 224,72 L224,90 Z",
    glass: ["M122,55 L135,41 Q138,39 143,39 L150,39 L150,55 Z", "M154,39 L162,40 Q169,41 173,47 L180,55 L154,55 Z"],
    wheels: [{ cx: 64, r: 19 }, { cx: 176, r: 19 }],
    wheelCY: 88,
    belt: "M40,66 L212,66",
  },
  suv: {
    body:
      "M22,90 L22,58 Q24,48 40,47 L92,46 L108,32 Q113,28 124,28 L178,29 Q192,30 196,42 L206,52 L218,56 Q226,58 226,68 L226,90 Z",
    glass: ["M112,46 L124,33 Q127,31 133,31 L150,31 L150,46 Z", "M154,31 L176,32 Q184,33 187,44 L188,46 L154,46 Z"],
    wheels: [{ cx: 62, r: 21 }, { cx: 178, r: 21 }],
    wheelCY: 86,
    belt: "M38,62 L214,62",
  },
  coupe: {
    body:
      "M26,90 L26,66 Q28,58 46,57 L98,55 L120,39 Q127,33 140,33 L164,35 Q186,38 196,54 L214,60 Q224,62 224,72 L224,90 Z",
    glass: ["M124,55 L138,40 Q143,37 152,37 L168,39 Q180,42 186,53 L186,55 Z"],
    wheels: [{ cx: 64, r: 19 }, { cx: 176, r: 19 }],
    wheelCY: 88,
    belt: "M42,66 L212,66",
  },
  hatchback: {
    body:
      "M24,90 L24,64 Q26,57 42,56 L92,54 L112,39 Q116,35 126,35 L156,36 Q168,37 174,47 L182,58 L196,60 Q202,61 202,70 L202,90 Z",
    glass: ["M116,54 L126,40 Q129,38 134,38 L150,38 L150,54 Z", "M154,39 L156,38 Q162,40 167,48 L174,54 L154,54 Z"],
    wheels: [{ cx: 62, r: 18 }, { cx: 168, r: 18 }],
    wheelCY: 88,
    belt: "M38,64 L192,64",
  },
  pickup: {
    body:
      "M22,90 L22,64 Q24,57 40,56 L78,55 L92,40 Q96,36 106,36 L132,37 Q140,38 142,48 L142,58 L230,58 L230,90 Z",
    glass: ["M94,55 L106,41 Q108,39 114,39 L130,40 Q136,41 137,49 L137,55 Z"],
    wheels: [{ cx: 60, r: 19 }, { cx: 192, r: 19 }],
    wheelCY: 88,
    belt: "M150,64 L224,64",
  },
  van: {
    body:
      "M20,92 L20,44 Q22,34 38,33 L92,33 L104,26 Q108,23 116,23 L214,24 Q226,25 226,40 L226,92 Z",
    glass: ["M106,42 L106,28 Q109,25 115,25 L128,26 L128,42 Z", "M138,42 L138,28 L170,28 L170,42 Z"],
    wheels: [{ cx: 58, r: 18 }, { cx: 196, r: 18 }],
    wheelCY: 90,
    belt: "M34,58 L220,58",
  },
  convertible: {
    body:
      "M26,90 L26,66 Q28,58 46,57 L110,55 L124,45 L134,45 L138,55 L206,58 Q224,60 224,72 L224,90 Z",
    glass: ["M118,55 L128,46 L134,46 L134,55 Z"],
    wheels: [{ cx: 64, r: 19 }, { cx: 176, r: 19 }],
    wheelCY: 88,
    belt: "M44,66 L214,66",
  },
  sports: {
    body:
      "M24,88 L24,72 Q26,66 42,64 L104,62 L130,50 Q140,46 156,47 L196,54 Q222,58 232,70 L232,80 Q232,86 222,86 L30,86 Q24,86 24,80 Z",
    glass: ["M108,62 L130,51 Q136,49 146,50 L172,55 Q182,57 186,62 L186,62 Z"],
    wheels: [{ cx: 66, r: 20 }, { cx: 182, r: 20 }],
    wheelCY: 84,
    belt: "M40,72 L214,72",
  },
}

function Wheel({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#15171b" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#000" strokeOpacity={0.5} strokeWidth={2} />
      <circle cx={cx} cy={cy} r={r * 0.46} fill="#2b3038" />
      <circle cx={cx} cy={cy} r={r * 0.46} fill="none" stroke="#4a515b" strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={r * 0.12} fill="#6b7280" />
    </g>
  )
}

export function CarSilhouette({
  bodyType,
  color,
  className,
  title,
}: {
  bodyType: BodyType
  color?: string | null
  className?: string
  title?: string
}) {
  const shape = SHAPES[bodyType] ?? SHAPES.sedan
  const { paint, isLight } = resolvePaint(color)
  const dark = shade(paint, -0.32)
  const light = shade(paint, 0.28)
  const outline = isLight ? "rgba(0,0,0,0.35)" : shade(paint, -0.55)
  const gradId = `carpaint-${bodyType}-${paint.replace("#", "")}`

  return (
    <svg
      viewBox="0 0 248 104"
      className={cn("h-full w-full", className)}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={title || `${bodyType} vehicle`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={light} />
          <stop offset="52%" stopColor={paint} />
          <stop offset="100%" stopColor={dark} />
        </linearGradient>
      </defs>

      {/* ground shadow */}
      <ellipse cx="128" cy="98" rx="104" ry="7" fill="#000" opacity={0.28} />

      {/* body */}
      <path d={shape.body} fill={`url(#${gradId})`} stroke={outline} strokeWidth={2} strokeLinejoin="round" />

      {/* glass */}
      {shape.glass.map((d, i) => (
        <path key={i} d={d} fill="#0d1420" opacity={0.82} stroke={shade(paint, -0.45)} strokeWidth={1} />
      ))}
      {/* glass highlight */}
      {shape.glass.map((d, i) => (
        <path key={`h-${i}`} d={d} fill="none" stroke="#9fb4cc" strokeOpacity={0.25} strokeWidth={1} />
      ))}

      {/* beltline / body highlight */}
      {shape.belt && <path d={shape.belt} fill="none" stroke={light} strokeOpacity={0.5} strokeWidth={1.5} />}

      {/* wheels */}
      {shape.wheels.map((w, i) => (
        <Wheel key={i} cx={w.cx} cy={shape.wheelCY} r={w.r} />
      ))}
    </svg>
  )
}

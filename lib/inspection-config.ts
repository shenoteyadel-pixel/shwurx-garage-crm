import type { DamageType, Severity } from "@/lib/actions-inspections"

/**
 * Single source of truth for damage/condition types and severities, shared by
 * the interactive map, the selected-area panel, and the printed report.
 * `dot` is a Tailwind bg class; `hex` is the literal colour for SVG markers and
 * print (where Tailwind classes on <circle> are less reliable).
 */
export const DAMAGE_TYPES: {
  key: DamageType
  label: string
  description: string
  dot: string
  hex: string
}[] = [
  { key: "scratch", label: "Scratch", description: "Surface scratch / clear coat", dot: "bg-red-500", hex: "#ef4444" },
  { key: "dent", label: "Dent", description: "Dent / minor impact", dot: "bg-amber-500", hex: "#f59e0b" },
  { key: "paint", label: "Paint", description: "Repainted area / paint work", dot: "bg-blue-500", hex: "#3b82f6" },
  { key: "rust", label: "Rust", description: "Rust / corrosion", dot: "bg-orange-700", hex: "#c2410c" },
  { key: "crack", label: "Crack", description: "Crack / glass / plastic", dot: "bg-fuchsia-500", hex: "#d946ef" },
  { key: "other", label: "Other", description: "Other / note", dot: "bg-emerald-500", hex: "#10b981" },
]

export const DAMAGE_MAP: Record<DamageType, (typeof DAMAGE_TYPES)[number]> = DAMAGE_TYPES.reduce(
  (acc, d) => {
    acc[d.key] = d
    return acc
  },
  {} as Record<DamageType, (typeof DAMAGE_TYPES)[number]>,
)

export const SEVERITIES: { key: Severity; label: string }[] = [
  { key: "minor", label: "Minor" },
  { key: "moderate", label: "Moderate" },
  { key: "severe", label: "Severe" },
]

export const FUEL_LEVELS = ["Empty", "1/4", "1/2", "3/4", "Full"]

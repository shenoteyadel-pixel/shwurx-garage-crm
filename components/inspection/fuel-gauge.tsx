"use client"

import { useState } from "react"
import { Fuel } from "lucide-react"
import { FUEL_LEVELS } from "@/lib/inspection-config"
import { cn } from "@/lib/utils"

const CX = 60
const CY = 60
const R = 46
const SHORT_LABELS: Record<string, string> = { Empty: "E", "1/4": "¼", "1/2": "½", "3/4": "¾", Full: "F" }

function point(fraction: number, radius: number) {
  const angle = Math.PI * (1 - fraction)
  return { x: CX + radius * Math.cos(angle), y: CY - radius * Math.sin(angle) }
}

function arc(from: number, to: number) {
  const a = point(from, R)
  const b = point(to, R)
  return `M ${a.x} ${a.y} A ${R} ${R} 0 0 1 ${b.x} ${b.y}`
}

function fractionOf(level: string | null | undefined) {
  const i = FUEL_LEVELS.indexOf(level ?? "")
  return i < 0 ? null : i / (FUEL_LEVELS.length - 1)
}

type GaugeDialProps = { level: string | null | undefined; onSelect?: (level: string) => void; className?: string }

function GaugeDial({ level, onSelect, className }: GaugeDialProps) {
  const fraction = fractionOf(level)
  const needle = point(fraction ?? 0, R - 10)
  const low = fraction !== null && fraction <= 0.25

  return (
    <svg viewBox="-8 -8 136 80" className={cn("w-full", className)} aria-hidden={onSelect ? undefined : true}>
      <path d={arc(0, 1)} fill="none" strokeWidth={9} strokeLinecap="round" className="stroke-muted" />
      {fraction !== null && fraction > 0 && (
        <path
          d={arc(0, fraction)}
          fill="none"
          strokeWidth={9}
          strokeLinecap="round"
          className={low ? "stroke-destructive" : "stroke-primary"}
        />
      )}
      {FUEL_LEVELS.map((l, i) => {
        const f = i / (FUEL_LEVELS.length - 1)
        const inner = point(f, R - 7)
        const outer = point(f, R + 7)
        const label = point(f, R + 14)
        return (
          <g
            key={l}
            onClick={onSelect ? () => onSelect(l) : undefined}
            className={onSelect ? "cursor-pointer" : undefined}
          >
            <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} strokeWidth={1.5} className="stroke-foreground/40" />
            <text
              x={label.x}
              y={label.y + 3}
              textAnchor="middle"
              fontSize={8}
              fontWeight={level === l ? 700 : 500}
              className={level === l ? "fill-foreground" : "fill-muted-foreground"}
            >
              {SHORT_LABELS[l]}
            </text>
          </g>
        )
      })}
      {fraction !== null && (
        <line
          x1={CX}
          y1={CY}
          x2={needle.x}
          y2={needle.y}
          strokeWidth={2.5}
          strokeLinecap="round"
          className="stroke-foreground transition-all duration-300"
        />
      )}
      <circle cx={CX} cy={CY} r={4.5} className="fill-foreground" />
    </svg>
  )
}

/** Read-only fuel gauge for tracking pages and printouts. */
export function FuelGaugeDisplay({ level, className }: { level: string | null | undefined; className?: string }) {
  if (!level) return null
  return (
    <figure className={cn("flex w-32 flex-col items-center", className)} aria-label={`Fuel level: ${level}`}>
      <GaugeDial level={level} />
      <figcaption className="-mt-1 flex items-center gap-1 text-xs font-medium">
        <Fuel className="h-3 w-3" aria-hidden />
        {level}
      </figcaption>
    </figure>
  )
}

/** Tap-to-set fuel gauge. Submits its value through a hidden input named `name`. */
export function FuelGaugeInput({
  name,
  defaultValue,
  disabled,
  onChange,
}: {
  name: string
  defaultValue: string | null
  disabled?: boolean
  onChange?: (level: string) => Promise<void> | void
}) {
  const [level, setLevel] = useState(defaultValue ?? "")
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")

  async function choose(next: string) {
    const prev = level
    setLevel(next)
    if (!onChange) return
    setStatus("saving")
    try {
      await onChange(next)
      setStatus("saved")
    } catch {
      setLevel(prev)
      setStatus("error")
    }
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-background/40 p-3">
      <input type="hidden" name={name} value={level} />
      <div className="w-44">
        <GaugeDial level={level} onSelect={disabled ? undefined : choose} />
      </div>
      <div className="h-4 text-[11px] text-muted-foreground" aria-live="polite">
        {status === "saving" && "Saving…"}
        {status === "saved" && "Saved"}
        {status === "error" && <span className="text-destructive">Could not save, try again</span>}
      </div>
      <div role="radiogroup" aria-label="Fuel level" className="flex w-full justify-between gap-1">
        {FUEL_LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={level === l}
            disabled={disabled}
            onClick={() => choose(l)}
            className={cn(
              "flex-1 rounded-md border px-1 py-1 text-xs font-medium transition disabled:opacity-50",
              level === l
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}

"use client"

import * as React from "react"
import { Button } from "@/components/ui"
import { CircleCheck, TriangleAlert, Sparkles, ShieldQuestion } from "lucide-react"
import type { Confidence, IdField, VehicleIdentification } from "@/lib/actions-vehicle-id"

const CONF_STYLE: Record<Confidence, string> = {
  high: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  low: "border-red-500/40 bg-red-500/10 text-red-300",
}
const CONF_LABEL: Record<Confidence, string> = { high: "HIGH", medium: "MEDIUM", low: "LOW" }

function Row({ label, f }: { label: string; f: IdField | null }) {
  if (!f) return null
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground/70">{label}</dt>
      <dd className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{f.value}</span>
        <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${CONF_STYLE[f.confidence]}`}>
          {CONF_LABEL[f.confidence]}
        </span>
      </dd>
    </div>
  )
}

/**
 * Confidence-aware identification result. Renders normalized make/model/year/
 * generation/variant/engine/body with per-field confidence, surfaces REVIEW
 * REQUIRED with both conflicting values, and applies only on the user's click
 * (never silently overwrites the form).
 */
export function VehicleIdCard({
  id,
  onApply,
}: {
  id: VehicleIdentification
  onApply: (id: VehicleIdentification) => void
}) {
  const sourceLabel =
    id.source === "vin+ai"
      ? "VIN + AI"
      : id.source === "vin"
        ? "VIN decode"
        : id.source === "ai-search"
          ? "AI search"
          : "Catalog"

  return (
    <div className="mt-3 rounded-lg border border-border bg-background/50 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {id.reviewRequired ? (
            <ShieldQuestion className="h-4 w-4 text-amber-400" />
          ) : (
            <CircleCheck className="h-4 w-4 text-emerald-400" />
          )}
          Vehicle identified
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          <Sparkles className="h-3 w-3" /> {sourceLabel}
        </span>
      </div>

      {id.reviewRequired && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-300">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <span className="font-semibold">REVIEW REQUIRED.</span> {id.note}
            {id.conflicts.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {id.conflicts.map((c) => (
                  <li key={c.field}>
                    <span className="uppercase">{c.field}:</span> {c.values.join("  vs  ")}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <dl className="mt-1 divide-y divide-border/60">
        <Row label="Make" f={id.make} />
        <Row label="Model" f={id.model} />
        <Row label="Year" f={id.year} />
        <Row label="Generation" f={id.generation} />
        <Row label="Variant" f={id.variant} />
        <Row label="Engine" f={id.engine} />
        <Row label="Body" f={id.bodyType} />
      </dl>

      {!id.reviewRequired && !id.inCatalog && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          New to the catalog — it will be added safely to this vehicle record when you apply.
        </p>
      )}

      <Button type="button" variant={id.reviewRequired ? "secondary" : "primary"} className="mt-3 w-full" onClick={() => onApply(id)}>
        {id.reviewRequired ? "Apply anyway — I've reviewed it" : "Apply to form"}
      </Button>
    </div>
  )
}

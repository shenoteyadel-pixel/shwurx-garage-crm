"use client"

import * as React from "react"
import { DAMAGE_MAP, DAMAGE_TYPES } from "@/lib/inspection-config"
import type { TrackInspection, TrackInspectionMarker } from "@/lib/tracking-data"

const VIEW_IMAGE: Record<string, string> = {
  top: "/inspection/car-top.png",
  front: "/inspection/car-front.png",
  rear: "/inspection/car-rear.png",
  left: "/inspection/car-left.png",
  right: "/inspection/car-right.png",
}

const VIEW_LABELS: { key: string; label: string; big?: boolean }[] = [
  { key: "front", label: "Front" },
  { key: "left", label: "Left Side" },
  { key: "top", label: "Top", big: true },
  { key: "right", label: "Right Side" },
  { key: "rear", label: "Rear" },
]

function damageHex(type: string): string {
  return DAMAGE_MAP[type as keyof typeof DAMAGE_MAP]?.hex ?? "#10b981"
}

function damageLabel(type: string): string {
  return DAMAGE_MAP[type as keyof typeof DAMAGE_MAP]?.label ?? "Other"
}

/** Read-only vehicle view with pinned markers (no click, no edit). */
function ReadOnlyView({
  viewKey,
  label,
  big,
  markers,
  selectedId,
  onSelect,
}: {
  viewKey: string
  label: string
  big?: boolean
  markers: TrackInspectionMarker[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const viewMarkers = markers.filter((m) => m.view === viewKey)
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <div
        className={`relative w-full overflow-hidden rounded-lg border border-border/60 bg-[#0a0a0a] ${
          big ? "aspect-[3/4]" : "aspect-square"
        }`}
      >
        <img
          src={VIEW_IMAGE[viewKey] || "/placeholder.svg"}
          alt={`${label} view of vehicle`}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />
        {viewMarkers.map((m) => {
          const isSel = m.id === selectedId
          return (
            <button
              key={m.id}
              onClick={() => onSelect(m.id)}
              aria-label={`${damageLabel(m.damageType)} at ${m.locationLabel ?? label}`}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md transition ${
                isSel ? "z-10 h-5 w-5 ring-2 ring-primary ring-offset-1 ring-offset-background" : "h-3.5 w-3.5"
              }`}
              style={{ left: `${m.xPct}%`, top: `${m.yPct}%`, backgroundColor: damageHex(m.damageType) }}
            />
          )
        })}
      </div>
    </div>
  )
}

export function TrackInspectionDiagram({ inspection }: { inspection: TrackInspection }) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const { markers } = inspection

  // Only show legend entries that are actually present.
  const presentTypes = DAMAGE_TYPES.filter((t) => markers.some((m) => m.damageType === t.key))

  return (
    <div className="space-y-4">
      {(inspection.odometer != null || inspection.fuelLevel) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {inspection.odometer != null && (
            <span className="rounded-md border border-border bg-background/60 px-2.5 py-1 text-muted-foreground">
              Odometer: <span className="font-medium text-foreground">{inspection.odometer.toLocaleString()} km</span>
            </span>
          )}
          {inspection.fuelLevel && (
            <span className="rounded-md border border-border bg-background/60 px-2.5 py-1 text-muted-foreground">
              Fuel: <span className="font-medium text-foreground">{inspection.fuelLevel}</span>
            </span>
          )}
        </div>
      )}

      {markers.length === 0 && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-600 dark:text-emerald-400">
          No damage was recorded during the check-in inspection — your vehicle was received in good condition.
        </div>
      )}

      {/* Diagram spread */}
      <div className="rounded-xl border border-border bg-background/40 p-4">
        <div className="mx-auto max-w-md">
          <div className="grid grid-cols-3 items-center gap-x-3 gap-y-2">
            <div />
            <ReadOnlyView viewKey="front" label="Front" markers={markers} selectedId={selectedId} onSelect={setSelectedId} />
            <div />
            <ReadOnlyView viewKey="left" label="Left Side" markers={markers} selectedId={selectedId} onSelect={setSelectedId} />
            <ReadOnlyView viewKey="top" label="Top" big markers={markers} selectedId={selectedId} onSelect={setSelectedId} />
            <ReadOnlyView viewKey="right" label="Right Side" markers={markers} selectedId={selectedId} onSelect={setSelectedId} />
            <div />
            <ReadOnlyView viewKey="rear" label="Rear" markers={markers} selectedId={selectedId} onSelect={setSelectedId} />
            <div />
          </div>
        </div>
      </div>

      {/* Legend */}
      {presentTypes.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {presentTypes.map((t) => (
            <span key={t.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-full border border-white/50" style={{ backgroundColor: t.hex }} />
              {t.label}
            </span>
          ))}
        </div>
      )}

      {/* Documented items list */}
      <ul className="space-y-2">
        {markers.map((m, i) => {
          const isSel = m.id === selectedId
          return (
            <li
              key={m.id}
              onClick={() => setSelectedId(m.id)}
              className={`cursor-pointer rounded-lg border p-3 transition ${
                isSel ? "border-primary/60 bg-primary/5" : "border-border bg-card hover:border-border/80"
              }`}
            >
              <div className="flex items-start gap-2">
                <span
                  className="mt-0.5 h-3 w-3 shrink-0 rounded-full border border-white/50"
                  style={{ backgroundColor: damageHex(m.damageType) }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                    <span className="font-medium text-foreground">
                      {i + 1}. {damageLabel(m.damageType)}
                    </span>
                    {m.locationLabel && <span className="text-muted-foreground">— {m.locationLabel}</span>}
                    {m.severity && (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                        {m.severity}
                      </span>
                    )}
                  </div>
                  {m.note && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{m.note}</p>}
                  {m.photos.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.photos.map((p) => (
                        <a
                          key={p.id}
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="block h-16 w-16 overflow-hidden rounded-md border border-border"
                        >
                          <img
                            src={p.url || "/placeholder.svg"}
                            alt={`${damageLabel(m.damageType)} close-up`}
                            className="h-full w-full object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

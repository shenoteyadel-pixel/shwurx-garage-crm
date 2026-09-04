"use client"

import * as React from "react"
import { DAMAGE_MAP } from "@/lib/inspection-config"
import type { MarkerView, DamageType } from "@/lib/actions-inspections"
import type { InspectionMarker } from "@/components/inspection/inspection-panel"
import { cn } from "@/lib/utils"
import { ZoomIn, ZoomOut, RotateCcw, X } from "lucide-react"

const VIEW_IMAGE: Record<MarkerView, string> = {
  top: "/inspection/car-top.png",
  front: "/inspection/car-front.png",
  rear: "/inspection/car-rear.png",
  left: "/inspection/car-left.png",
  right: "/inspection/car-right.png",
}

/**
 * The premium multi-view inspection stage: the whole vehicle shown from every
 * angle at once (front top, left/top/right middle row, rear bottom), matching
 * the reference. Each view is its own click surface that reports marker
 * coordinates relative to that view, so markers pin exactly where tapped.
 */

type ViewCfg = { key: MarkerView; label: string; sub?: string }

function ClickableView({
  cfg,
  markers,
  selectedId,
  completed,
  big,
  onAdd,
  onSelect,
  onDelete,
}: {
  cfg: ViewCfg
  markers: InspectionMarker[]
  selectedId: string | null
  completed: boolean
  big?: boolean
  onAdd: (view: MarkerView, x: number, y: number) => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const viewMarkers = markers.filter((m) => m.view === cfg.key)

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (completed) return
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    if (x < 0 || x > 100 || y < 0 || y > 100) return
    onAdd(cfg.key, Number(x.toFixed(2)), Number(y.toFixed(2)))
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{cfg.label}</span>
      <div
        ref={ref}
        onClick={handleClick}
        className={cn(
          "relative w-full overflow-hidden rounded-lg border border-border/60 bg-[#0a0a0a] transition",
          big ? "aspect-[3/4]" : "aspect-square",
          !completed && "cursor-crosshair hover:border-primary/40",
        )}
      >
        <img
          src={VIEW_IMAGE[cfg.key] || "/placeholder.svg"}
          alt={`${cfg.label} view of vehicle`}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />
        {viewMarkers.map((m) => {
          const d = DAMAGE_MAP[m.damage_type]
          const isSel = m.id === selectedId
          return (
            <React.Fragment key={m.id}>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect(m.id)
                }}
                aria-label={`${d.label} marker`}
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md transition",
                  isSel ? "z-10 h-5 w-5 ring-2 ring-primary ring-offset-1 ring-offset-background" : "h-3.5 w-3.5",
                )}
                style={{ left: `${m.x_pct}%`, top: `${m.y_pct}%`, backgroundColor: d.hex }}
              />
              {isSel && !completed && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(m.id)
                  }}
                  aria-label="Delete this marker"
                  title="Delete this marker"
                  className="absolute z-20 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-primary text-white shadow-md transition hover:scale-110"
                  style={{ left: `calc(${m.x_pct}% + 14px)`, top: `calc(${m.y_pct}% - 12px)` }}
                >
                  <X className="h-3 w-3" strokeWidth={3} />
                </button>
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

export function InspectionStage({
  markers,
  selectedId,
  activeType,
  completed,
  onAdd,
  onSelect,
  onDelete,
}: {
  markers: InspectionMarker[]
  selectedId: string | null
  activeType: DamageType
  completed: boolean
  onAdd: (view: MarkerView, x: number, y: number) => void
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [zoom, setZoom] = React.useState(1)
  const shared = { markers, selectedId, completed, onAdd, onSelect, onDelete }

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-background/40 p-4">
      {/* Left mini toolbar */}
      <div className="absolute left-3 top-3 z-20 flex flex-col gap-1 rounded-lg border border-border bg-card/90 p-1 backdrop-blur">
        <button
          onClick={() => setZoom((z) => Math.min(2, z + 0.15))}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Zoom in"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.6, z - 0.15))}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Zoom out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => setZoom(1)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Reset zoom"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Active-type hint */}
      {!completed && (
        <div className="absolute right-3 top-3 z-20 rounded-md border border-border bg-card/90 px-2.5 py-1 text-[10px] text-muted-foreground backdrop-blur">
          Tap any view to add:{" "}
          <span className="font-semibold" style={{ color: DAMAGE_MAP[activeType].hex }}>
            {DAMAGE_MAP[activeType].label}
          </span>
        </div>
      )}

      {/* The spread */}
      <div
        className="mx-auto max-w-2xl origin-center transition-transform duration-200"
        style={{ transform: `scale(${zoom})` }}
      >
        <div className="grid grid-cols-3 items-center gap-x-3 gap-y-2">
          {/* Row 1: Front (center) */}
          <div />
          <ClickableView cfg={{ key: "front", label: "Front" }} {...shared} />
          <div />

          {/* Row 2: Left | Top(hero) | Right */}
          <ClickableView cfg={{ key: "left", label: "Left Side" }} {...shared} />
          <ClickableView cfg={{ key: "top", label: "Top" }} big {...shared} />
          <ClickableView cfg={{ key: "right", label: "Right Side" }} {...shared} />

          {/* Row 3: Rear (center) */}
          <div />
          <ClickableView cfg={{ key: "rear", label: "Rear" }} {...shared} />
          <div />
        </div>
      </div>
    </div>
  )
}

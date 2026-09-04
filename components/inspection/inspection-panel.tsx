"use client"

import * as React from "react"
import { Card, Button, Field, Input, Select, Textarea, GhostButton } from "@/components/ui"
import { PhotoUploader } from "@/components/photo-uploader"
import { VehicleSchematic, INSPECTION_VIEWS } from "@/components/inspection/vehicle-schematics"
import { DAMAGE_TYPES, DAMAGE_MAP, SEVERITIES, FUEL_LEVELS } from "@/lib/inspection-config"
import {
  addInspectionMarker,
  updateInspectionMarker,
  deleteInspectionMarker,
  addMarkerPhotos,
  deleteMarkerPhoto,
  saveInspectionDetails,
  completeInspection,
  type MarkerView,
  type DamageType,
  type Severity,
} from "@/lib/actions-inspections"
import { SignaturePad } from "@/components/inspection/signature-pad"
import { cn } from "@/lib/utils"
import { Trash2, MapPin, FileDown, Check, Loader2 } from "lucide-react"
import Link from "next/link"

export type InspectionMarkerPhoto = { id: string; url: string }
export type InspectionMarker = {
  id: string
  view: MarkerView
  x_pct: number
  y_pct: number
  damage_type: DamageType
  severity: Severity | null
  location_label: string | null
  note: string | null
  photos: InspectionMarkerPhoto[]
}
export type InspectionData = {
  id: string | null
  status: "in_progress" | "completed"
  odometer: number | null
  fuel_level: string | null
  general_notes: string | null
  signature_data_url: string | null
  signed_by_name: string | null
  markers: InspectionMarker[]
}

export function InspectionPanel({
  jobId,
  inspection,
  printHref,
}: {
  jobId: string
  inspection: InspectionData
  printHref: string
}) {
  const [view, setView] = React.useState<MarkerView>("top")
  const [activeType, setActiveType] = React.useState<DamageType>("scratch")
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [pendingPhotos, setPendingPhotos] = React.useState<string[]>([])
  const stageRef = React.useRef<HTMLDivElement>(null)

  const markers = inspection.markers
  const viewMarkers = markers.filter((m) => m.view === view)
  const selected = markers.find((m) => m.id === selectedId) ?? null
  const completed = inspection.status === "completed"

  async function handleStageClick(e: React.MouseEvent<HTMLDivElement>) {
    if (completed || busy) return
    const rect = stageRef.current?.getBoundingClientRect()
    if (!rect) return
    const xPct = ((e.clientX - rect.left) / rect.width) * 100
    const yPct = ((e.clientY - rect.top) / rect.height) * 100
    if (xPct < 0 || xPct > 100 || yPct < 0 || yPct > 100) return
    setBusy(true)
    try {
      const id = await addInspectionMarker({
        jobId,
        view,
        xPct: Number(xPct.toFixed(2)),
        yPct: Number(yPct.toFixed(2)),
        damageType: activeType,
      })
      setSelectedId(id)
      setPendingPhotos([])
    } finally {
      setBusy(false)
    }
  }

  async function patchSelected(patch: Partial<Pick<InspectionMarker, "damage_type" | "severity" | "location_label" | "note">>) {
    if (!selected) return
    await updateInspectionMarker({
      jobId,
      markerId: selected.id,
      damageType: patch.damage_type,
      severity: patch.severity,
      locationLabel: patch.location_label,
      note: patch.note,
    })
  }

  async function removeSelected() {
    if (!selected) return
    setBusy(true)
    try {
      await deleteInspectionMarker(jobId, selected.id)
      setSelectedId(null)
    } finally {
      setBusy(false)
    }
  }

  async function saveSelectedPhotos() {
    if (!selected || !pendingPhotos.length) return
    setBusy(true)
    try {
      await addMarkerPhotos(jobId, selected.id, pendingPhotos)
      setPendingPhotos([])
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Vehicle Inspection</h2>
          <p className="text-xs text-muted-foreground">Mark and document all damages and conditions</p>
        </div>
        <div className="flex items-center gap-2">
          {completed && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-500">
              <Check className="h-3 w-3" /> Completed
            </span>
          )}
          <Link
            href={printHref}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent"
          >
            <FileDown className="h-3.5 w-3.5" /> Condition Report
          </Link>
        </div>
      </div>

      {/* Header details */}
      <form action={saveInspectionDetails} className="mb-5 grid gap-3 sm:grid-cols-3">
        <input type="hidden" name="job_id" value={jobId} />
        <Field label="Odometer (km)">
          <Input name="odometer" type="number" defaultValue={inspection.odometer ?? ""} placeholder="e.g. 82000" disabled={completed} />
        </Field>
        <Field label="Fuel level">
          <Select name="fuel_level" defaultValue={inspection.fuel_level ?? ""} disabled={completed}>
            <option value="">—</option>
            {FUEL_LEVELS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <Button type="submit" variant="outline" size="sm" disabled={completed} className="w-full">
            Save details
          </Button>
        </div>
        <Field label="General notes" className="sm:col-span-3">
          <Textarea name="general_notes" defaultValue={inspection.general_notes ?? ""} placeholder="Overall condition, existing wear, customer remarks…" disabled={completed} />
        </Field>
      </form>

      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        {/* Map area */}
        <div>
          {/* View switcher */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {INSPECTION_VIEWS.map((v) => {
              const count = markers.filter((m) => m.view === v.key).length
              return (
                <button
                  key={v.key}
                  onClick={() => {
                    setView(v.key)
                    setSelectedId(null)
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                    view === v.key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {v.label}
                  {count > 0 && <span className="ml-1.5 text-muted-foreground">({count})</span>}
                </button>
              )
            })}
          </div>

          {/* Clickable stage */}
          <div
            ref={stageRef}
            onClick={handleStageClick}
            className={cn(
              "relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-background/40",
              !completed && "cursor-crosshair",
            )}
          >
            <VehicleSchematic view={view} />
            {viewMarkers.map((m) => {
              const d = DAMAGE_MAP[m.damage_type]
              const isSel = m.id === selectedId
              return (
                <button
                  key={m.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedId(m.id)
                    setPendingPhotos([])
                  }}
                  aria-label={`${d.label} marker`}
                  className={cn(
                    "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md transition",
                    isSel ? "h-5 w-5 ring-2 ring-offset-2 ring-offset-background ring-primary" : "h-4 w-4",
                  )}
                  style={{ left: `${m.x_pct}%`, top: `${m.y_pct}%`, backgroundColor: d.hex }}
                />
              )
            })}
            {!completed && (
              <span className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-background/80 px-2 py-1 text-[10px] text-muted-foreground">
                Click on the diagram to add a {DAMAGE_MAP[activeType].label.toLowerCase()} marker
              </span>
            )}
          </div>

          {/* Legend / active type picker */}
          <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {DAMAGE_TYPES.map((d) => (
              <button
                key={d.key}
                onClick={() => setActiveType(d.key)}
                disabled={completed}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition disabled:opacity-50",
                  activeType === d.key ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
                )}
              >
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: d.hex }} />
                <span className="truncate">
                  <span className="font-medium text-foreground">{d.label}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Selected area details */}
        <div className="rounded-xl border border-border bg-background/40 p-3">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Selected Area Details
          </h3>
          {!selected ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-xs text-muted-foreground">
              <MapPin className="h-5 w-5" />
              <p>Select a marker to edit its condition and photos, or click the diagram to add one.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Type">
                <Select
                  defaultValue={selected.damage_type}
                  disabled={completed}
                  onChange={(e) => patchSelected({ damage_type: e.target.value as DamageType })}
                >
                  {DAMAGE_TYPES.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Severity">
                <Select
                  defaultValue={selected.severity ?? ""}
                  disabled={completed}
                  onChange={(e) => patchSelected({ severity: (e.target.value || null) as Severity | null })}
                >
                  <option value="">—</option>
                  {SEVERITIES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Location">
                <Input
                  defaultValue={selected.location_label ?? ""}
                  placeholder="e.g. Left front door"
                  disabled={completed}
                  onBlur={(e) => patchSelected({ location_label: e.target.value || null })}
                />
              </Field>
              <Field label="Notes">
                <Textarea
                  defaultValue={selected.note ?? ""}
                  placeholder="Describe the damage…"
                  disabled={completed}
                  onBlur={(e) => patchSelected({ note: e.target.value || null })}
                />
              </Field>

              {/* Marker photos */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Photos ({selected.photos.length})</span>
                </div>
                {selected.photos.length > 0 && (
                  <div className="mb-2 grid grid-cols-3 gap-1.5">
                    {selected.photos.map((p) => (
                      <div key={p.id} className="group relative aspect-square overflow-hidden rounded-md border border-border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url || "/placeholder.svg"} alt="Damage" className="h-full w-full object-cover" />
                        {!completed && (
                          <button
                            onClick={() => deleteMarkerPhoto(jobId, p.id)}
                            className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
                            aria-label="Delete photo"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {!completed && (
                  <>
                    <PhotoUploader value={pendingPhotos} onChange={setPendingPhotos} label="Add photos" accentDamage />
                    {pendingPhotos.length > 0 && (
                      <Button size="sm" variant="outline" className="mt-2 w-full" onClick={saveSelectedPhotos} disabled={busy}>
                        {busy ? "Saving…" : `Attach ${pendingPhotos.length} photo(s)`}
                      </Button>
                    )}
                  </>
                )}
              </div>

              {!completed && (
                <Button variant="danger" size="sm" className="w-full" onClick={removeSelected} disabled={busy}>
                  <Trash2 className="h-3.5 w-3.5" /> Remove marker
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Signature + complete */}
      {!completed ? (
        <CompleteInspection jobId={jobId} markerCount={markers.length} />
      ) : (
        inspection.signature_data_url && (
          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Signed by {inspection.signed_by_name || "customer"}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={inspection.signature_data_url || "/placeholder.svg"}
              alt="Customer signature"
              className="h-20 rounded-lg border border-border bg-white"
            />
          </div>
        )
      )}
    </Card>
  )
}

function CompleteInspection({ jobId, markerCount }: { jobId: string; markerCount: number }) {
  const [name, setName] = React.useState("")
  const [sig, setSig] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function submit() {
    setBusy(true)
    try {
      await completeInspection({ jobId, signatureDataUrl: sig, signedByName: name || null })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-5 border-t border-border pt-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Customer sign-off
      </h3>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
        <Field label="Customer name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
        </Field>
        <Field label="Signature">
          <SignaturePad onChange={setSig} />
        </Field>
      </div>
      <Button className="mt-3" onClick={submit} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Complete inspection ({markerCount} marker{markerCount === 1 ? "" : "s"})
      </Button>
    </div>
  )
}

"use client"

import * as React from "react"
import { Card, Button, Field, Input, Select, Textarea } from "@/components/ui"
import { PhotoUploader } from "@/components/photo-uploader"
import { InspectionStage } from "@/components/inspection/inspection-stage"
import { DAMAGE_TYPES, DAMAGE_MAP, SEVERITIES, FUEL_LEVELS } from "@/lib/inspection-config"
import {
  addInspectionMarker,
  updateInspectionMarker,
  deleteInspectionMarker,
  clearInspectionMarkers,
  addMarkerPhotos,
  deleteMarkerPhoto,
  saveInspectionDetails,
  completeInspection,
  setJobBodyType,
  type MarkerView,
  type DamageType,
  type Severity,
} from "@/lib/actions-inspections"
import { BODY_TYPES, BODY_TYPE_LABELS, type BodyType } from "@/lib/body-type"
import { useRouter } from "next/navigation"
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

const TABS = ["Inspection Map", "Photos", "Notes", "History"] as const
type Tab = (typeof TABS)[number]

export function InspectionPanel({
  jobId,
  inspection,
  printHref,
  bodyType: initialBodyType,
  make,
  model,
}: {
  jobId: string
  inspection: InspectionData
  printHref: string
  bodyType?: string | null
  make?: string | null
  model?: string | null
}) {
  const router = useRouter()
  const [tab, setTab] = React.useState<Tab>("Inspection Map")
  // The diagram is primarily driven by make/model (model-accurate). `override`
  // is a manual correction the advisor can apply; when set it wins for the
  // session and persists to the job's body_type.
  const [override, setOverride] = React.useState<BodyType | null>(null)

  async function handleBodyType(next: BodyType) {
    const prev = override
    setOverride(next) // optimistic
    try {
      await setJobBodyType(jobId, next)
      router.refresh()
    } catch {
      setOverride(prev) // revert on failure
    }
  }
  const [activeType, setActiveType] = React.useState<DamageType>("scratch")
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [pendingPhotos, setPendingPhotos] = React.useState<string[]>([])
  const [signOpen, setSignOpen] = React.useState(false)

  const markers = inspection.markers
  const selected = markers.find((m) => m.id === selectedId) ?? null
  const completed = inspection.status === "completed"
  const allPhotos = markers.flatMap((m) => m.photos.map((p) => ({ ...p, marker: m })))

  async function handleAdd(view: MarkerView, x: number, y: number) {
    if (busy) return
    setBusy(true)
    try {
      const id = await addInspectionMarker({ jobId, view, xPct: x, yPct: y, damageType: activeType })
      setSelectedId(id)
      setPendingPhotos([])
    } finally {
      setBusy(false)
    }
  }

  async function patchSelected(
    patch: Partial<Pick<InspectionMarker, "damage_type" | "severity" | "location_label" | "note">>,
  ) {
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
    await removeMarker(selected.id)
  }

  async function removeMarker(markerId: string) {
    setBusy(true)
    try {
      await deleteInspectionMarker(jobId, markerId)
      setSelectedId((cur) => (cur === markerId ? null : cur))
    } finally {
      setBusy(false)
    }
  }

  async function clearAll() {
    if (!markers.length) return
    if (!confirm(`Remove all ${markers.length} marker(s) from this inspection?`)) return
    setBusy(true)
    try {
      await clearInspectionMarkers(jobId)
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
    <Card className="overflow-hidden p-0">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Vehicle Inspection</h2>
          <p className="text-xs text-muted-foreground">Mark and document all damages and conditions</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
              completed
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                : "border-amber-500/40 bg-amber-500/10 text-amber-500",
            )}
          >
            {completed ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
            {completed ? "Completed" : "In Progress"}
          </span>
          <Link
            href={printHref}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent"
          >
            <FileDown className="h-3.5 w-3.5" /> Report
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border px-3">
        {TABS.map((t) => {
          const count = t === "Photos" ? allPhotos.length : undefined
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "relative px-3 py-2.5 text-xs font-medium transition",
                tab === t ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
              {count ? <span className="ml-1 text-muted-foreground">({count})</span> : null}
              {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />}
            </button>
          )
        })}
      </div>

      <div className="p-5">
        {tab === "Inspection Map" && (
          <>
            {/* Vehicle meta row */}
            <form action={saveInspectionDetails} className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <input type="hidden" name="job_id" value={jobId} />
              <Field label="Odometer (km)">
                <Input
                  name="odometer"
                  type="number"
                  defaultValue={inspection.odometer ?? ""}
                  placeholder="e.g. 82000"
                  disabled={completed}
                />
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
                  Save
                </Button>
              </div>
            </form>

            {/* Body-type override: the diagram is auto-detected from the make &
                model; advisors can override the shape here if needed. */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">Diagram shape</span>
              <Select
                aria-label="Diagram body type override"
                value={override ?? ""}
                onChange={(e) => handleBodyType(e.target.value as BodyType)}
                disabled={completed}
                className="h-8 w-auto text-sm"
              >
                <option value="">Auto (from make &amp; model)</option>
                {BODY_TYPES.map((b) => (
                  <option key={b} value={b}>
                    {BODY_TYPE_LABELS[b]}
                  </option>
                ))}
              </Select>
              <span className="text-[11px] text-muted-foreground">
                {override ? "Manual override applied." : "Auto-detected from the vehicle. Change to override."}
              </span>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
              {/* Stage: make/model drive the model-accurate render; a manual
                  override (when set) takes priority via the body type. */}
              <InspectionStage
                markers={markers}
                selectedId={selectedId}
                activeType={activeType}
                completed={completed}
                make={override ? null : make}
                model={override ? null : model}
                bodyType={override ?? initialBodyType}
                onAdd={handleAdd}
                onSelect={(id) => {
                  setSelectedId(id)
                  setPendingPhotos([])
                }}
                onDelete={removeMarker}
              />

              {/* Right rail */}
              <div className="space-y-4">
                {/* Damage / Condition Types */}
                <div className="rounded-xl border border-border bg-background/40 p-3">
                  <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Damage / Condition Types
                  </h3>
                  <div className="space-y-1">
                    {DAMAGE_TYPES.map((d) => (
                      <button
                        key={d.key}
                        onClick={() => setActiveType(d.key)}
                        disabled={completed}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition disabled:opacity-50",
                          activeType === d.key
                            ? "border-primary bg-primary/5"
                            : "border-transparent hover:bg-accent",
                        )}
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white"
                          style={{ backgroundColor: d.hex }}
                        >
                          <span className="h-2 w-2 rounded-full bg-white/90" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-medium text-foreground">{d.label}</span>
                          <span className="block truncate text-[10px] text-muted-foreground">{d.description}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Selected Area Details */}
                <div className="rounded-xl border border-border bg-background/40 p-3">
                  <div className="mb-2.5 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Selected Area Details
                    </h3>
                    {selected && !completed && (
                      <button
                        onClick={removeSelected}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-md border border-primary/40 px-2 py-1 text-[10px] font-medium text-primary transition hover:bg-primary/10 disabled:opacity-50"
                        aria-label="Delete this marker"
                      >
                        <Trash2 className="h-3 w-3" /> Delete marker
                      </button>
                    )}
                  </div>
                  {!selected ? (
                    <div className="flex flex-col items-center gap-2 py-6 text-center text-xs text-muted-foreground">
                      <MapPin className="h-5 w-5" />
                      <p>Tap a marker to edit it, or tap a view to add one.</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
                        <span
                          className="h-4 w-4 shrink-0 rounded-full"
                          style={{ backgroundColor: DAMAGE_MAP[selected.damage_type].hex }}
                        />
                        <span className="text-xs font-medium capitalize text-foreground">{selected.view} view</span>
                      </div>
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

                      {/* Photos */}
                      <div>
                        <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Photos ({selected.photos.length})
                        </span>
                        {selected.photos.length > 0 && (
                          <div className="mb-2 grid grid-cols-3 gap-1.5">
                            {selected.photos.map((p) => (
                              <div
                                key={p.id}
                                className="group relative aspect-square overflow-hidden rounded-md border border-border"
                              >
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
                              <Button
                                size="sm"
                                variant="outline"
                                className="mt-2 w-full"
                                onClick={saveSelectedPhotos}
                                disabled={busy}
                              >
                                {busy ? "Saving…" : `Attach ${pendingPhotos.length} photo(s)`}
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom action bar */}
            {!completed && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                <Button variant="outline" size="sm" onClick={clearAll} disabled={busy || !markers.length}>
                  <Trash2 className="h-3.5 w-3.5" /> Clear All
                </Button>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {markers.length} marker{markers.length === 1 ? "" : "s"}
                  </span>
                  <Button onClick={() => setSignOpen((v) => !v)}>
                    <Check className="h-4 w-4" /> Complete Inspection
                  </Button>
                </div>
              </div>
            )}

            {/* Sign-off */}
            {!completed && signOpen && <CompleteInspection jobId={jobId} markerCount={markers.length} />}
            {completed && inspection.signature_data_url && (
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
            )}
          </>
        )}

        {tab === "Photos" && (
          <div>
            {allPhotos.length === 0 ? (
              <Placeholder text="No inspection photos yet. Add photos to a marker on the Inspection Map." />
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {allPhotos.map((p) => (
                  <div key={p.id} className="overflow-hidden rounded-lg border border-border">
                    <div className="aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url || "/placeholder.svg"} alt="Inspection" className="h-full w-full object-cover" />
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: DAMAGE_MAP[p.marker.damage_type].hex }}
                      />
                      <span className="truncate text-[10px] text-muted-foreground">
                        {p.marker.location_label || `${p.marker.view} view`}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "Notes" && (
          <form action={saveInspectionDetails} className="space-y-3">
            <input type="hidden" name="job_id" value={jobId} />
            <input type="hidden" name="odometer" value={inspection.odometer ?? ""} />
            <input type="hidden" name="fuel_level" value={inspection.fuel_level ?? ""} />
            <Field label="General inspection notes">
              <Textarea
                name="general_notes"
                rows={6}
                defaultValue={inspection.general_notes ?? ""}
                placeholder="Overall condition, existing wear, customer remarks…"
                disabled={completed}
              />
            </Field>
            {!completed && <Button type="submit" size="sm">Save notes</Button>}
          </form>
        )}

        {tab === "History" && (
          <Placeholder text="A full change history and before/after comparison will appear here in a later phase." />
        )}
      </div>
    </Card>
  )
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed border-border py-12 text-center text-xs text-muted-foreground">
      <p className="max-w-xs text-pretty">{text}</p>
    </div>
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
    <div className="mt-5 rounded-xl border border-border bg-background/40 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer sign-off</h3>
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
        Confirm & complete ({markerCount} marker{markerCount === 1 ? "" : "s"})
      </Button>
    </div>
  )
}

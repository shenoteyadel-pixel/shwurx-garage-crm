"use client"

import * as React from "react"
import { addPhotos, deletePhoto, setCoverPhoto, clearCoverPhoto, type PhotoKind } from "@/lib/actions"
import { PhotoUploader } from "@/components/photo-uploader"
import { Button, Card } from "@/components/ui"
import { X, Star, ImageIcon } from "lucide-react"

type Photo = { id: string; url: string; kind: string; caption: string | null }

const CATEGORIES: { key: PhotoKind; label: string; hint: string; damage?: boolean }[] = [
  { key: "vehicle", label: "Vehicle", hint: "Exterior / general car shots" },
  { key: "damage", label: "Damage / Inspection", hint: "Damage and inspection photos", damage: true },
  { key: "parts", label: "Parts", hint: "Parts, components, spare parts" },
  { key: "document", label: "Documents", hint: "Registration, insurance, paperwork" },
  { key: "other", label: "Other", hint: "Anything else" },
]

export function JobPhotos({
  jobId,
  photos,
  coverUrl,
}: {
  jobId: string
  photos: Photo[]
  coverUrl?: string | null
}) {
  const [adding, setAdding] = React.useState<PhotoKind | null>(null)
  const [pending, setPending] = React.useState<string[]>([])
  const [saving, setSaving] = React.useState(false)

  async function savePending(kind: PhotoKind) {
    if (!pending.length) return setAdding(null)
    setSaving(true)
    try {
      await addPhotos(jobId, pending, kind)
      setPending([])
      setAdding(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Photos</h2>
        <span className="text-[11px] text-muted-foreground">
          {coverUrl ? "Cover photo set" : "No cover photo \u2014 using placeholder"}
        </span>
      </div>

      {/* Current cover preview */}
      <div className="mb-5 flex items-center gap-3 rounded-lg border border-border bg-background/40 p-3">
        <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl || "/placeholder.svg"} alt="Vehicle cover" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageIcon className="h-5 w-5" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-foreground">Vehicle Cover Photo</p>
          <p className="text-[11px] text-muted-foreground">
            Shown on Car Flow, job lists and customer tracking. Choose it explicitly with{" "}
            <span className="text-foreground">Set as cover</span> below.
          </p>
        </div>
        {coverUrl && (
          <form action={clearCoverPhoto.bind(null, jobId)}>
            <Button type="submit" variant="ghost" size="sm">
              Clear
            </Button>
          </form>
        )}
      </div>

      {CATEGORIES.map((cat, idx) => {
        const list = photos.filter((p) => p.kind === cat.key)
        return (
          <div key={cat.key} className={idx > 0 ? "mt-6" : ""}>
            <Section
              title={cat.label}
              hint={cat.hint}
              photos={list}
              jobId={jobId}
              coverUrl={coverUrl}
              accentDamage={cat.damage}
              onAdd={() => {
                setPending([])
                setAdding(cat.key)
              }}
            />
            {adding === cat.key && (
              <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
                <PhotoUploader
                  value={pending}
                  onChange={setPending}
                  label={`Upload ${cat.label.toLowerCase()} photos`}
                  accentDamage={cat.damage}
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setAdding(null)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => savePending(cat.key)} disabled={saving}>
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </Card>
  )
}

function Section({
  title,
  hint,
  photos,
  jobId,
  coverUrl,
  onAdd,
  accentDamage,
}: {
  title: string
  hint: string
  photos: Photo[]
  jobId: string
  coverUrl?: string | null
  onAdd: () => void
  accentDamage?: boolean
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {title} <span className="text-muted-foreground/60">({photos.length})</span>
        </span>
        <button onClick={onAdd} className="text-xs font-medium text-primary hover:underline">
          + Add
        </button>
      </div>
      {photos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
          {hint}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p) => {
            const isCover = coverUrl != null && p.url === coverUrl
            return (
              <div
                key={p.id}
                className={
                  "group relative aspect-square overflow-hidden rounded-lg border " +
                  (isCover ? "border-primary ring-1 ring-primary" : "border-border")
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url || "/placeholder.svg"}
                  alt={p.caption || title}
                  className="h-full w-full object-cover"
                />

                {isCover && (
                  <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold text-primary-foreground">
                    <Star className="h-2.5 w-2.5 fill-current" /> Cover
                  </span>
                )}

                <div className="absolute inset-x-1 bottom-1 opacity-0 transition group-hover:opacity-100">
                  {!isCover && (
                    <form action={setCoverPhoto.bind(null, jobId, p.url)}>
                      <button
                        type="submit"
                        className="inline-flex w-full items-center justify-center gap-1 rounded-md bg-primary/90 px-1.5 py-1 text-[9px] font-semibold text-primary-foreground hover:bg-primary"
                      >
                        <Star className="h-2.5 w-2.5" /> Set as cover
                      </button>
                    </form>
                  )}
                </div>

                <form action={deletePhoto.bind(null, p.id, jobId)}>
                  <button
                    type="submit"
                    className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white opacity-0 transition group-hover:opacity-100"
                    aria-label="Delete photo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </form>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

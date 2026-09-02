"use client"

import * as React from "react"
import { addPhotos, deletePhoto } from "@/lib/actions"
import { PhotoUploader } from "@/components/photo-uploader"
import { Button, Card } from "@/components/ui"
import { X } from "lucide-react"

type Photo = { id: string; url: string; kind: "vehicle" | "damage"; caption: string | null }

export function JobPhotos({ jobId, photos }: { jobId: string; photos: Photo[] }) {
  const vehicle = photos.filter((p) => p.kind === "vehicle")
  const damage = photos.filter((p) => p.kind === "damage")
  const [adding, setAdding] = React.useState<null | "vehicle" | "damage">(null)
  const [pending, setPending] = React.useState<string[]>([])
  const [saving, setSaving] = React.useState(false)

  async function savePending(kind: "vehicle" | "damage") {
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
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Photos</h2>
      </div>

      <Section
        title="Vehicle"
        photos={vehicle}
        jobId={jobId}
        onAdd={() => {
          setPending([])
          setAdding("vehicle")
        }}
      />
      {adding === "vehicle" && (
        <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
          <PhotoUploader value={pending} onChange={setPending} label="Upload vehicle photos" />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setAdding(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => savePending("vehicle")} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-6">
        <Section
          title="Damage / Inspection"
          photos={damage}
          jobId={jobId}
          accentDamage
          onAdd={() => {
            setPending([])
            setAdding("damage")
          }}
        />
        {adding === "damage" && (
          <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
            <PhotoUploader value={pending} onChange={setPending} label="Upload damage photos" accentDamage />
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAdding(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => savePending("damage")} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}

function Section({
  title,
  photos,
  jobId,
  onAdd,
  accentDamage,
}: {
  title: string
  photos: Photo[]
  jobId: string
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
          No {accentDamage ? "damage" : "vehicle"} photos.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p) => (
            <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url || "/placeholder.svg"} alt={p.caption || title} className="h-full w-full object-cover" />
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
          ))}
        </div>
      )}
    </div>
  )
}

"use client"

import * as React from "react"
import { addPhotos, deletePhoto, setCoverPhoto, clearCoverPhoto } from "@/lib/actions"
import { PHOTO_CATEGORIES, type PhotoKind } from "@/lib/trades"
import { PhotoUploader } from "@/components/photo-uploader"
import { Button, Card } from "@/components/ui"
import { X, Star, ImageIcon, Camera } from "lucide-react"

type Photo = { id: string; url: string; kind: string; caption: string | null; uploaded_by?: string | null }

export function JobPhotos({
  jobId,
  photos,
  coverUrl,
  allowedKinds,
  uploaderNames = {},
  uploaderRoles = {},
  canManageCover = true,
  currentUserId,
}: {
  jobId: string
  photos: Photo[]
  coverUrl?: string | null
  /** Categories this viewer may upload to. Omit to allow every category. */
  allowedKinds?: PhotoKind[]
  uploaderNames?: Record<string, string>
  uploaderRoles?: Record<string, string>
  canManageCover?: boolean
  currentUserId?: string | null
}) {
  const isWorkshop = (p: Photo) => !!p.uploaded_by && uploaderRoles[p.uploaded_by] === "technician"
  const [adding, setAdding] = React.useState<PhotoKind | null>(null)
  const [pending, setPending] = React.useState<string[]>([])
  const [saving, setSaving] = React.useState(false)

  const canUpload = (k: PhotoKind) => !allowedKinds || allowedKinds.includes(k)
  // Upload sections first, then any other category that already has photos,
  // so everyone sees the whole car history on the same job card.
  const visible = [
    ...PHOTO_CATEGORIES.filter((c) => canUpload(c.key)),
    ...PHOTO_CATEGORIES.filter((c) => !canUpload(c.key) && photos.some((p) => p.kind === c.key)),
  ]
  const knownKinds = new Set(PHOTO_CATEGORIES.map((c) => c.key as string))
  const legacy = photos.filter((p) => !knownKinds.has(p.kind))

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
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Photos</h2>
        <span className="text-xs text-muted-foreground">{photos.length} total</span>
      </div>

      {canManageCover && (
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
            <p className="text-xs text-muted-foreground">
              Shown on Car Flow, job lists and customer tracking. Use <span className="text-foreground">Set as cover</span>{" "}
              on any photo.
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
      )}

      <div className="flex flex-col gap-6">
        {visible.map((cat) => {
          const list = photos.filter((p) => p.kind === cat.key)
          const uploadable = canUpload(cat.key)
          return (
            <div key={cat.key}>
              <Section
                title={cat.label}
                hint={cat.hint}
                photos={list}
                jobId={jobId}
                coverUrl={coverUrl}
                uploaderNames={uploaderNames}
                isWorkshop={isWorkshop}
                canManageCover={canManageCover}
                canDelete={(p) => canManageCover || (!!currentUserId && p.uploaded_by === currentUserId)}
                onAdd={
                  uploadable
                    ? () => {
                        setPending([])
                        setAdding(cat.key)
                      }
                    : undefined
                }
              />
              {adding === cat.key && (
                <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
                  <PhotoUploader
                    value={pending}
                    onChange={setPending}
                    label={`Upload ${cat.label.toLowerCase()} photos`}
                    accentDamage={cat.damage}
                  />
                  <div className="mt-3 flex gap-2">
                    <Button variant="ghost" className="flex-1 sm:flex-none" onClick={() => setAdding(null)}>
                      Cancel
                    </Button>
                    <Button className="flex-1 sm:flex-none" onClick={() => savePending(cat.key)} disabled={saving}>
                      {saving ? "Saving..." : "Save photos"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {legacy.length > 0 && (
          <Section
            title="Other"
            hint=""
            photos={legacy}
            jobId={jobId}
            coverUrl={coverUrl}
            uploaderNames={uploaderNames}
            isWorkshop={isWorkshop}
            canManageCover={canManageCover}
            canDelete={() => canManageCover}
          />
        )}
      </div>
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
  uploaderNames,
  isWorkshop,
  canManageCover,
  canDelete,
}: {
  title: string
  hint: string
  photos: Photo[]
  jobId: string
  coverUrl?: string | null
  onAdd?: () => void
  uploaderNames: Record<string, string>
  isWorkshop: (p: Photo) => boolean
  canManageCover: boolean
  canDelete: (p: Photo) => boolean
}) {
  const groups = [
    { key: "advisor", label: "Service advisor", photos: photos.filter((p) => !isWorkshop(p)) },
    { key: "workshop", label: "Technician", photos: photos.filter(isWorkshop) },
  ].filter((g) => g.photos.length > 0)

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          {title} <span className="text-muted-foreground">({photos.length})</span>
        </span>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-primary/40 px-3 text-xs font-semibold text-primary hover:bg-primary/10"
          >
            <Camera className="h-3.5 w-3.5" /> Add
          </button>
        )}
      </div>
      {photos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
          {hint}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
        {groups.map((g) => (
        <div key={g.key}>
        <p
          className={
            "mb-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold " +
            (g.key === "workshop" ? "bg-primary/10 text-primary" : "bg-muted text-foreground")
          }
        >
          {g.label} <span className="text-muted-foreground">({g.photos.length})</span>
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {g.photos.map((p) => {
            const isCover = coverUrl != null && p.url === coverUrl
            const by = p.uploaded_by ? uploaderNames[p.uploaded_by] : null
            return (
              <div
                key={p.id}
                className={
                  "group relative aspect-square overflow-hidden rounded-lg border " +
                  (isCover ? "border-primary ring-1 ring-primary" : "border-border")
                }
              >
                <a href={p.url} target="_blank" rel="noreferrer" className="block h-full w-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url || "/placeholder.svg"} alt={p.caption || title} className="h-full w-full object-cover" />
                </a>

                {isCover && (
                  <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    <Star className="h-2.5 w-2.5 fill-current" /> Cover
                  </span>
                )}

                {by && (
                  <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-background/80 px-1.5 py-0.5 text-[10px] text-foreground">
                    {by}
                  </span>
                )}

                {canManageCover && !isCover && (
                  <form
                    action={setCoverPhoto.bind(null, jobId, p.url)}
                    className="absolute inset-x-1 bottom-5 hidden group-hover:block"
                  >
                    <button
                      type="submit"
                      className="inline-flex w-full items-center justify-center gap-1 rounded-md bg-primary/90 px-1.5 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary"
                    >
                      <Star className="h-2.5 w-2.5" /> Set as cover
                    </button>
                  </form>
                )}

                {canDelete(p) && (
                  <form action={deletePhoto.bind(null, p.id, jobId)}>
                    <button
                      type="submit"
                      className="absolute right-1 top-1 rounded-full bg-background/80 p-1.5 text-foreground transition sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label="Delete photo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </form>
                )}
              </div>
            )
          })}
        </div>
        </div>
        ))}
        </div>
      )}
    </div>
  )
}

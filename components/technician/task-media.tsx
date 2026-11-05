"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Camera } from "lucide-react"
import { Button, Input, Select } from "@/components/ui"
import { MEDIA_PHASES } from "@/lib/technician-tasks"
import { uploadTaskMedia } from "@/lib/actions-technician"

export type TaskMediaItem = {
  id: string
  url: string
  phase: string | null
  media_type: string
  caption: string | null
  created_at: string
}

export function TaskMedia({ taskId, media, locked }: { taskId: string; media: TaskMediaItem[]; locked: boolean }) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <section aria-labelledby="media-heading" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <h2 id="media-heading" className="text-base font-semibold">
        Photos & videos
      </h2>

      {MEDIA_PHASES.map((phase) => {
        const items = media.filter((m) => (m.phase ?? "during") === phase.value)
        if (!items.length) return null
        return (
          <div key={phase.value} className="flex flex-col gap-2">
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground">{phase.label}</h3>
            <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {items.map((m) => (
                <li key={m.id} className="flex flex-col gap-1">
                  {m.media_type === "video" ? (
                    <video src={m.url} controls preload="metadata" className="aspect-video w-full rounded-md bg-muted object-cover" />
                  ) : (
                    <a href={m.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated media */}
                      <img src={m.url} alt={m.caption || `${phase.label} photo`} className="aspect-video w-full rounded-md bg-muted object-cover" />
                    </a>
                  )}
                  {m.caption && <span className="text-xs text-muted-foreground">{m.caption}</span>}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
      {!media.length && <p className="text-sm text-muted-foreground">No photos or videos yet.</p>}

      {!locked && (
        <form
          ref={formRef}
          className="flex flex-col gap-3 md:flex-row md:items-end"
          action={(fd) => {
            setError(null)
            start(async () => {
              const res = await uploadTaskMedia(taskId, fd)
              if (res.ok) {
                formRef.current?.reset()
                router.refresh()
              } else setError(res.error)
            })
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Stage</span>
            <Select name="phase" defaultValue="before" className="md:w-32">
              {MEDIA_PHASES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Photo or video (max 8 MB photo, 11 MB video)</span>
            <Input name="file" type="file" accept="image/*,video/*" capture="environment" required />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Caption</span>
            <Input name="caption" maxLength={300} placeholder="e.g. Oil leak at rear main seal" />
          </label>
          <Button type="submit" disabled={pending}>
            <Camera className="h-4 w-4" aria-hidden /> {pending ? "Uploading…" : "Upload"}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  )
}

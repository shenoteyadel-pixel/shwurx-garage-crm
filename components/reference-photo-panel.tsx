"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Card, Button } from "@/components/ui"
import { refreshVehicleMasterImage, setCustomVehicleImage } from "@/lib/actions-customers"
import { RefreshCw, Upload, CheckCircle2, ImageOff, AlertTriangle, ImageIcon } from "lucide-react"

type Status = "real" | "custom" | "none"

function statusOf(url: string | null | undefined, source: string | null | undefined): Status {
  if (!url) return "none"
  if (source === "custom") return "custom"
  return "real"
}

export function ReferencePhotoPanel({
  vehicleId,
  referenceImageUrl,
  imageSource,
  imageResolvedAt,
  canManage,
}: {
  vehicleId: string
  referenceImageUrl: string | null
  imageSource: string | null
  imageResolvedAt: string | null
  canManage: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const status = statusOf(referenceImageUrl, imageSource)

  const badge = {
    real: {
      icon: CheckCircle2,
      label: "Real image found",
      cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    },
    custom: { icon: ImageIcon, label: "Custom image", cls: "border-sky-500/30 bg-sky-500/10 text-sky-400" },
    none: { icon: ImageOff, label: "Not found — retry required", cls: "border-amber-500/30 bg-amber-500/10 text-amber-400" },
  }[status]
  const BadgeIcon = badge.icon

  const sourceLabel = imageSource === "custom" ? "Custom upload" : imageSource === "carsxe" ? "CarsXE" : "—"
  const resolved = imageResolvedAt
    ? new Date(imageResolvedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    : "—"

  function onRefresh() {
    setMsg(null)
    start(async () => {
      try {
        const res = await refreshVehicleMasterImage(vehicleId, { force: true })
        setMsg(res.found ? "Reference photo updated" : "No real image found — showing silhouette")
        router.refresh()
      } catch (e: any) {
        setMsg(e.message ?? "Refresh failed")
      } finally {
        setTimeout(() => setMsg(null), 3000)
      }
    })
  }

  async function onUpload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    setMsg(null)
    try {
      const supabase = createClient()
      const file = files[0]
      const ext = file.name.split(".").pop() || "jpg"
      const path = `reference/${vehicleId}-${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from("vehicle-photos").upload(path, file, { upsert: false })
      if (error) throw new Error(error.message)
      const { data } = supabase.storage.from("vehicle-photos").getPublicUrl(path)
      await setCustomVehicleImage(vehicleId, data.publicUrl)
      setMsg("Custom reference photo saved")
      router.refresh()
    } catch (e: any) {
      setMsg(e.message ?? "Upload failed")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
      setTimeout(() => setMsg(null), 3000)
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reference Photo</h2>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
          <BadgeIcon className="h-3 w-3" />
          {badge.label}
        </span>
      </div>

      <dl className="mb-3 space-y-1 text-xs">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Source</dt>
          <dd className="font-medium">{sourceLabel}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Last resolved</dt>
          <dd className="font-medium">{resolved}</dd>
        </div>
      </dl>

      {status === "none" ? (
        <p className="mb-3 flex items-start gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] text-amber-300/90">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          No real photo was found automatically. Try refreshing, or upload a custom reference photo below.
        </p>
      ) : null}

      {canManage ? (
        <div className="flex flex-col gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={pending} className="justify-start">
            <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} />
            {pending ? "Resolving…" : "Refresh vehicle photo"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="justify-start"
          >
            <Upload className={`h-4 w-4 ${uploading ? "animate-pulse" : ""}`} />
            {uploading ? "Uploading…" : "Use custom reference photo"}
          </Button>
          <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={(e) => onUpload(e.target.files)} />
        </div>
      ) : null}

      {msg ? <p className="mt-2 text-[11px] text-muted-foreground">{msg}</p> : null}
    </Card>
  )
}

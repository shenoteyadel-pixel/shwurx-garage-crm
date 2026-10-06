"use client"

import { useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Camera, ImagePlus, Loader2, X } from "lucide-react"

export function PhotoUploader({
  value,
  onChange,
  label,
  accentDamage,
}: {
  value: string[]
  onChange: (urls: string[]) => void
  label: string
  accentDamage?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [failed, setFailed] = useState(0)

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return
    setUploading(true)
    setFailed(0)
    const supabase = createClient()
    const uploaded: string[] = []
    let failures = 0
    try {
      for (const file of Array.from(files)) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase()
        const path = `${crypto.randomUUID()}.${ext}`
        const { error } = await supabase.storage.from("vehicle-photos").upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || "image/jpeg",
        })
        if (error) {
          failures++
          continue
        }
        const { data } = supabase.storage.from("vehicle-photos").getPublicUrl(path)
        uploaded.push(data.publicUrl)
      }
    } catch {
      failures = files.length - uploaded.length
    } finally {
      if (uploaded.length) onChange([...value, ...uploaded])
      setFailed(failures)
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
      if (cameraRef.current) cameraRef.current.value = ""
    }
  }

  const tileClass =
    "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      {failed > 0 && (
        <p role="alert" className="mb-2 text-xs text-destructive">
          {failed === 1 ? "1 photo" : `${failed} photos`} could not upload. Check the connection and try again.
        </p>
      )}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {value.map((url) => (
          <div key={url} className="group relative aspect-square overflow-hidden rounded-lg border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url || "/placeholder.svg"} alt="Vehicle" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(value.filter((u) => u !== url))}
              className="absolute right-1 top-1 rounded-full bg-background/80 p-1.5 text-foreground transition sm:opacity-0 sm:group-hover:opacity-100"
              aria-label="Remove photo"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={uploading}
          onClick={() => cameraRef.current?.click()}
          className={cn(tileClass, accentDamage ? "border-red-500/40" : "border-border")}
        >
          <Camera className="h-5 w-5" />
          <span className="text-[10px]">Camera</span>
        </button>
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className={cn(tileClass, accentDamage ? "border-red-500/40" : "border-border")}
        >
          <ImagePlus className="h-5 w-5" />
          <span className="text-[10px]">Library</span>
        </button>
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label={`${label}: take photo`}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        aria-label={`${label}: choose from library`}
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  )
}

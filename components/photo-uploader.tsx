"use client"

import { useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { ImagePlus, Loader2, X } from "lucide-react"

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
  const [uploading, setUploading] = useState(false)

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return
    setUploading(true)
    const supabase = createClient()
    const uploaded: string[] = []
    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() || "jpg"
      const path = `${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from("vehicle-photos").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      })
      if (!error) {
        const { data } = supabase.storage.from("vehicle-photos").getPublicUrl(path)
        uploaded.push(data.publicUrl)
      }
    }
    onChange([...value, ...uploaded])
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {value.map((url) => (
          <div key={url} className="group relative aspect-square overflow-hidden rounded-lg border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url || "/placeholder.svg"} alt="Vehicle" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(value.filter((u) => u !== url))}
              className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white opacity-0 transition group-hover:opacity-100"
              aria-label="Remove photo"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground transition hover:border-primary hover:text-primary",
            accentDamage ? "border-red-500/40" : "border-border",
          )}
        >
          <ImagePlus className="h-5 w-5" />
          <span className="text-[10px]">Add</span>
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  )
}

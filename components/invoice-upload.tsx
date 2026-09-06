"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui"
import { extractAndCreateInvoice } from "@/lib/actions-invoices"
import { UploadCloud, Camera, Loader2, FileWarning } from "lucide-react"

// Accept the formats phones and suppliers actually produce. `image/*` plus the
// explicit HEIC/HEIF types covers iPhone photos; PDF covers emailed invoices.
const UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,image/*,application/pdf,.heic,.heif,.pdf"

export function InvoiceUpload() {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const fileInput = React.useRef<HTMLInputElement>(null)
  const cameraInput = React.useRef<HTMLInputElement>(null)

  async function handleFile(file: File | undefined) {
    if (!file || busy) return
    setError(null)
    setBusy(true)
    try {
      const fd = new FormData()
      fd.set("file", file)
      const res = await extractAndCreateInvoice(fd)
      if (res.ok) router.push(`/purchasing/invoices/${res.id}`)
      else setError(res.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setBusy(false)
    }
  }

  if (busy) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-12 text-center">
        <Loader2 className="h-9 w-9 animate-spin text-primary" />
        <div>
          <p className="text-base font-semibold">Reading the invoice…</p>
          <p className="text-sm text-muted-foreground">
            Extracting supplier, TRN, parts, VAT and totals — this can take a few seconds.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          handleFile(e.dataTransfer.files?.[0])
        }}
        className={`rounded-2xl border-2 border-dashed p-6 transition ${
          dragging ? "border-primary bg-primary/5" : "border-border bg-card/40"
        }`}
      >
        <div className="mb-4 text-center">
          <p className="text-base font-semibold">New purchase invoice</p>
          <p className="text-sm text-muted-foreground">
            Take a photo or upload the supplier invoice — we read it automatically.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Take photo — opens the rear camera on phones */}
          <button
            type="button"
            onClick={() => cameraInput.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-xl bg-primary px-4 py-6 text-primary-foreground transition hover:opacity-90 active:scale-[0.99]"
          >
            <Camera className="h-8 w-8" />
            <span className="text-sm font-semibold">Take Photo</span>
            <span className="text-xs opacity-80">Opens your camera</span>
          </button>

          {/* Upload — file picker for JPG / PNG / HEIC / PDF */}
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-secondary px-4 py-6 text-foreground transition hover:bg-accent active:scale-[0.99]"
          >
            <UploadCloud className="h-8 w-8" />
            <span className="text-sm font-semibold">Upload Invoice</span>
            <span className="text-xs text-muted-foreground">JPG · PNG · HEIC · PDF</span>
          </button>
        </div>

        <p className="mt-3 text-center text-xs text-muted-foreground">or drag &amp; drop a file here · up to 20MB</p>

        <input
          ref={fileInput}
          type="file"
          accept={UPLOAD_ACCEPT}
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <FileWarning className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
    </div>
  )
}

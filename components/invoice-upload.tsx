"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui"
import { extractAndCreateInvoice } from "@/lib/actions-invoices"
import { UploadCloud, Camera, Loader2, FileWarning } from "lucide-react"

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
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition ${
          dragging ? "border-primary bg-primary/5" : "border-border bg-card/40"
        }`}
      >
        {busy ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium">Reading the invoice…</p>
              <p className="text-xs text-muted-foreground">Extracting supplier, line items, VAT and totals</p>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-full bg-primary/10 p-3">
              <UploadCloud className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Drop a supplier invoice here</p>
              <p className="text-xs text-muted-foreground">Photo, scan or PDF · up to 20MB</p>
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
              <Button type="button" size="sm" onClick={() => fileInput.current?.click()}>
                <UploadCloud className="h-4 w-4" /> Choose file
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => cameraInput.current?.click()}>
                <Camera className="h-4 w-4" /> Take photo
              </Button>
            </div>
          </>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*,application/pdf"
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

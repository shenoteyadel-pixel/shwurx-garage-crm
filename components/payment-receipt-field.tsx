"use client"

import * as React from "react"
import { upload } from "@vercel/blob/client"
import { Loader2, Paperclip, CheckCircle2, X } from "lucide-react"

export const PROOF_REQUIRED_METHODS = ["card", "bank", "bank_transfer"]

export function methodNeedsProof(method: string) {
  return PROOF_REQUIRED_METHODS.includes(method)
}

/**
 * Uploads a payment receipt (card slip / bank transfer confirmation) directly
 * to private Blob storage and exposes its pathname as a hidden `receipt_path`
 * form field. Required when the payment method is card or bank transfer.
 */
export function PaymentReceiptField({
  method,
  onUploadingChange,
}: {
  method: string
  onUploadingChange?: (uploading: boolean) => void
}) {
  const required = methodNeedsProof(method)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [path, setPath] = React.useState<string>("")
  const [fileName, setFileName] = React.useState<string>("")
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setUploading(true)
    onUploadingChange?.(true)
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "bin"
      const blob = await upload(`payment-receipts/${crypto.randomUUID()}.${ext}`, file, {
        access: "private",
        contentType: file.type || undefined,
        handleUploadUrl: "/api/invoices/blob-upload",
      })
      setPath(blob.pathname)
      setFileName(file.name)
    } catch (e) {
      setPath("")
      setFileName("")
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
      onUploadingChange?.(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  function clear() {
    setPath("")
    setFileName("")
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input type="hidden" name="receipt_path" value={path} />
      <span className="text-sm font-medium">
        Payment proof / receipt{" "}
        {required ? (
          <span className="text-destructive">*</span>
        ) : (
          <span className="font-normal text-muted-foreground">(optional)</span>
        )}
      </span>

      {path ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          <span className="flex min-w-0 items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="truncate">{fileName}</span>
          </span>
          <button
            type="button"
            onClick={clear}
            className="rounded p-1 hover:bg-emerald-500/20"
            aria-label="Remove receipt"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <label
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm transition-colors hover:bg-secondary/60 ${
            required ? "border-primary/60 text-foreground" : "border-border text-muted-foreground"
          }`}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          {uploading ? "Uploading…" : "Upload photo or PDF of the receipt"}
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </label>
      )}

      {required && !path && !uploading && (
        <p className="text-xs text-muted-foreground">
          {method === "card" ? "Card payments" : "Bank transfers"} need the receipt uploaded as proof.
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

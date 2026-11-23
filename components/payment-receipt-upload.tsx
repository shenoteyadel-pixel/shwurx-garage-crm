"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { upload } from "@vercel/blob/client"
import { FileText, Loader2, Paperclip, RefreshCw } from "lucide-react"
import { attachInvoicePaymentReceipt } from "@/lib/actions-crm"

export function PaymentReceiptUpload({
  invoiceId,
  paymentId,
  receiptPath,
  canUpload,
}: {
  invoiceId: string
  paymentId: string
  receiptPath: string | null
  canUpload: boolean
}) {
  const router = useRouter()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "bin"
      const blob = await upload(`payment-receipts/${crypto.randomUUID()}.${ext}`, file, {
        access: "private",
        contentType: file.type || undefined,
        handleUploadUrl: "/api/invoices/blob-upload",
      })
      const res = await attachInvoicePaymentReceipt(invoiceId, paymentId, blob.pathname)
      if (!res.ok) setError(res.error)
      else router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {receiptPath && (
          <a
            href={`/api/file?pathname=${encodeURIComponent(receiptPath)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20"
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            View receipt
          </a>
        )}
        {canUpload && (
          <label
            className={`flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-secondary/60 ${
              receiptPath ? "border-border text-muted-foreground" : "border-primary/60 text-foreground"
            } ${uploading ? "pointer-events-none opacity-70" : ""}`}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : receiptPath ? (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {uploading ? "Uploading…" : receiptPath ? "Replace" : "Upload receipt"}
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
        {!receiptPath && !canUpload && <span className="text-xs text-muted-foreground">No receipt</span>}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

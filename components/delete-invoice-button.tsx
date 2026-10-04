"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui"
import { Modal } from "@/components/modal"
import { deleteDuplicateInvoice, deleteInvoiceDraft } from "@/lib/actions-invoices"

type Kind = "draft" | "duplicate"

export function DeleteInvoiceButton({
  id,
  label,
  kind,
  compact = false,
  redirectTo,
}: {
  id: string
  label: string
  kind: Kind
  compact?: boolean
  redirectTo?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const title = kind === "draft" ? "Delete draft invoice" : "Delete duplicate invoice"

  function onDelete() {
    setError(null)
    start(async () => {
      const res = kind === "draft" ? await deleteInvoiceDraft(id) : await deleteDuplicateInvoice(id)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setOpen(false)
      if (redirectTo) router.push(redirectTo)
      else router.refresh()
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`${title} ${label}`}
        className={
          compact
            ? "h-8 w-8 border-red-500/40 p-0 text-red-400 hover:bg-red-500/10"
            : "h-9 gap-1.5 border-red-500/40 px-3 text-red-400 hover:bg-red-500/10"
        }
      >
        <Trash2 className="h-4 w-4" aria-hidden="true" />
        {!compact && (kind === "draft" ? "Delete draft" : "Delete duplicate")}
      </Button>

      <Modal open={open} onClose={() => !pending && setOpen(false)} title={title}>
        <div className="flex flex-col gap-4">
          {kind === "draft" ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              This permanently removes draft <span className="font-mono text-foreground">{label}</span> and its uploaded
              file. Nothing was posted to stock yet, so no other records change.
            </p>
          ) : (
            <div className="flex flex-col gap-2 text-sm leading-relaxed text-muted-foreground">
              <p>
                This removes the extra copy <span className="font-mono text-foreground">{label}</span>. The other copy
                stays as the real invoice.
              </p>
              <ul className="list-disc pl-5">
                <li>The stock this copy added is taken back out of inventory.</li>
                <li>Part lines this copy added to job cards are removed.</li>
                <li>The supplier balance no longer counts it twice.</li>
              </ul>
              <p>Copies with recorded payments can&apos;t be deleted. Delete the unpaid copy instead.</p>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onDelete}
              disabled={pending}
              className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

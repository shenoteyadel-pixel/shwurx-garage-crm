"use client"

import { useState, useTransition } from "react"
import { Button, Input, Label } from "@/components/ui"
import { Modal } from "@/components/modal"
import { deleteJob } from "@/lib/actions"
import { Trash2 } from "lucide-react"

/**
 * Owner-only job-card delete. Soft-deletes into the Recycle Bin (recoverable),
 * so it requires an explicit typed confirmation to avoid accidental removal of
 * a car that carries quotations, invoices and photos.
 */
export function DeleteJobButton({ jobId, jobNumber }: { jobId: string; jobNumber: string }) {
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function onDelete() {
    setError(null)
    start(async () => {
      try {
        await deleteJob(jobId)
        // deleteJob redirects to /flow on success; nothing to do here.
      } catch (e: any) {
        setError(e?.message ?? "Failed to delete job card")
      }
    })
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 gap-1.5 border-destructive/40 px-2.5 text-xs text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="h-3.5 w-3.5" /> Delete
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Delete job card">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This moves job card <span className="font-mono text-foreground">{jobNumber}</span> to the
            Recycle Bin. It will be hidden from Car Flow, job lists, CRM and history, but can be
            restored later. Any linked invoices are preserved.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-delete">
              Type <span className="font-mono text-foreground">DELETE</span> to confirm
            </Label>
            <Input
              id="confirm-delete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onDelete}
              disabled={pending || confirmText.trim().toUpperCase() !== "DELETE"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {pending ? "Deleting…" : "Move to Recycle Bin"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

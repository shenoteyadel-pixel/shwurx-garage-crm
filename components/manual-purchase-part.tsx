"use client"

import * as React from "react"
import { addManualPurchasedPart } from "@/lib/actions-invoices"
import { Button, Card, Input } from "@/components/ui"
import { formatCurrency, cn } from "@/lib/utils"
import { Loader2, PackagePlus, Plus } from "lucide-react"

export function ManualPurchasePart({ jobId, defaultMarkup }: { jobId: string; defaultMarkup: number }) {
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [feedback, setFeedback] = React.useState<{ tone: "error" | "ok"; text: string } | null>(null)
  const formRef = React.useRef<HTMLFormElement>(null)

  async function handleSubmit(fd: FormData) {
    setPending(true)
    setFeedback(null)
    const res = await addManualPurchasedPart(jobId, fd)
    setPending(false)
    if (!res.ok) {
      setFeedback({ tone: "error", text: res.error })
      return
    }
    setFeedback({
      tone: "ok",
      text: `Added to the job card quotation as ${res.partNumber} at ${formatCurrency(res.salePrice ?? 0)} each.`,
    })
    formRef.current?.reset()
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <PackagePlus className="h-4 w-4" /> Part without invoice
        </h2>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
          <Plus className="h-3.5 w-3.5" /> Add part
        </Button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        For parts bought without a supplier invoice. The cost is recorded and the part goes to the quotation with
        markup. Leave OEM blank to auto-create a part number.
      </p>

      {feedback && (
        <p
          role="status"
          className={cn(
            "mt-3 rounded-lg border px-3 py-2 text-xs",
            feedback.tone === "error"
              ? "border-red-500/30 bg-red-500/10 text-red-300"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
          )}
        >
          {feedback.text}
        </p>
      )}

      {open && (
        <form ref={formRef} action={handleSubmit} className="mt-3 flex flex-col gap-2">
          <Input name="name" required placeholder="Part name" aria-label="Part name" />
          <Input name="oem" placeholder="OEM part # (optional)" aria-label="OEM part number" />
          <div className="grid grid-cols-2 gap-2">
            <Input name="quantity" type="number" min="1" defaultValue="1" aria-label="Quantity" placeholder="Qty" />
            <Input
              name="unit_cost"
              type="number"
              min="0"
              step="0.01"
              required
              aria-label="Unit cost"
              placeholder="Unit cost"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input name="supplier" placeholder="Supplier / shop" aria-label="Supplier" />
            <Input
              name="markup_pct"
              type="number"
              min="0"
              step="0.1"
              aria-label="Markup percent"
              placeholder={`Markup ${defaultMarkup}%`}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Add to job card
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

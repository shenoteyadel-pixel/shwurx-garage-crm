"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Copy, PenLine, ReceiptText, TrendingUp } from "lucide-react"
import { Button, Card } from "@/components/ui"
import { CrmModal } from "@/components/crm/crm-modal"
import { resolveDuplicateParts } from "@/lib/actions-quote-duplicates"
import type { CostSource, DuplicateGroup } from "@/lib/quote-duplicates"

const money = (v: number) => v.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const COST_LABEL: Record<CostSource, string> = {
  purchase: "purchase cost",
  request: "parts request cost",
  stock: "stock cost",
}

export function DuplicatePartsDialog({
  jobId,
  groups,
  showCosts,
}: {
  jobId: string
  groups: DuplicateGroup[]
  showCosts: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [keep, setKeep] = useState<Record<string, string>>(() =>
    Object.fromEntries(groups.map((g) => [g.key, g.defaultKeepId])),
  )

  if (groups.length === 0) return null
  const removeCount = groups.reduce((s, g) => s + g.lines.length - 1, 0)
  const purchaseCount = groups.reduce((s, g) => s + g.lines.filter((l) => l.fromInvoice).length, 0)
  const manualCount = groups.reduce((s, g) => s + g.lines.filter((l) => !l.fromInvoice).length, 0)

  return (
    <>
      <Card className="flex flex-wrap items-center justify-between gap-3 border-amber-500/40 p-4">
        <div className="flex min-w-0 items-start gap-3">
          <Copy className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {groups.length} part{groups.length === 1 ? " is" : "s are"} repeated on this job card
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {purchaseCount} from purchase invoices · {manualCount} added manually. Merge them so the customer is
              charged once.
            </p>
          </div>
        </div>
        <Button onClick={() => setOpen(true)}>Review &amp; merge</Button>
      </Card>

      <CrmModal
        open={open}
        onClose={() => setOpen(false)}
        closeLabel="Close"
        title="Merge repeated parts"
        description={
          showCosts
            ? "Each part stays once. The line with the bigger profit is selected for you; you can pick another."
            : "Each part stays once. The most profitable line is selected for you; you can pick another."
        }
        icon={<Copy className="mt-1 h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />}
        footer={
          <>
            {error && (
              <p className="w-full text-xs text-red-300" role="alert">
                {error}
              </p>
            )}
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Later
            </Button>
            <Button
              className="ml-auto"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null)
                  const res = await resolveDuplicateParts(jobId, keep)
                  if (!res.ok) {
                    setError(res.error ?? "Could not merge the parts.")
                    return
                  }
                  setOpen(false)
                  router.refresh()
                })
              }
            >
              {pending ? "Merging..." : `Merge · remove ${removeCount} line${removeCount === 1 ? "" : "s"}`}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <fieldset key={g.key} className="flex flex-col gap-2">
              <legend className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {g.lines[0].name}
              </legend>
              {g.lines.map((l) => {
                const checked = keep[g.key] === l.id
                const best = l.id === g.defaultKeepId
                return (
                  <label
                    key={l.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                      checked ? "border-primary bg-primary/10" : "border-border hover:bg-accent"
                    }`}
                  >
                    <input
                      type="radio"
                      name={g.key}
                      value={l.id}
                      checked={checked}
                      onChange={() => setKeep((k) => ({ ...k, [g.key]: l.id }))}
                      className="mt-1 h-4 w-4 accent-primary"
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        {l.fromInvoice ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                            <ReceiptText className="h-3 w-3" aria-hidden="true" /> From purchase
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                            <PenLine className="h-3 w-3" aria-hidden="true" /> Added manually
                          </span>
                        )}
                        {best && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                            <TrendingUp className="h-3 w-3" aria-hidden="true" /> Bigger profit
                          </span>
                        )}
                      </span>
                      <span className="text-xs leading-relaxed text-muted-foreground">
                        {l.partNumber ? `${l.partNumber} · ` : ""}Qty {l.quantity} × AED {money(l.unitPrice)} = AED{" "}
                        {money(l.revenue)}
                        {l.detail ? ` · ${l.detail}` : ""}
                      </span>
                      {showCosts && (
                        <span className="text-xs leading-relaxed">
                          {l.profit !== null && l.unitCost !== null && l.costSource ? (
                            <>
                              <span className={l.profit >= 0 ? "font-medium text-emerald-300" : "font-medium text-red-300"}>
                                Profit AED {money(l.profit)}
                              </span>
                              <span className="text-muted-foreground">
                                {" "}
                                · cost AED {money(l.unitCost)}/unit ({COST_LABEL[l.costSource]})
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">No cost recorded — ranked by selling total</span>
                          )}
                        </span>
                      )}
                    </span>
                  </label>
                )
              })}
            </fieldset>
          ))}
        </div>
      </CrmModal>
    </>
  )
}

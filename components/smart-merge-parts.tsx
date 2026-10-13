"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Sparkles } from "lucide-react"
import { Button, Card } from "@/components/ui"
import { smartMergeJobParts } from "@/lib/actions-quote-duplicates"
import type { ReconcileMerge } from "@/lib/job-parts-reconcile"

const money = (v: number) => v.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function SmartMergeParts({ jobId }: { jobId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [merges, setMerges] = useState<ReconcileMerge[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = () =>
    start(async () => {
      setError(null)
      const res = await smartMergeJobParts(jobId)
      if (!res.ok) return setError(res.error)
      setMerges(res.result.merges)
      if (res.result.merges.length) router.refresh()
    })

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium">Smart parts check</p>
            <p className="text-xs leading-relaxed text-muted-foreground text-pretty">
              Finds parts that came from both the supplier quote and the supplier invoice, keeps one line, and charges
              the higher amount.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={run} disabled={pending}>
          {pending ? "Checking…" : "Check & merge"}
        </Button>
      </div>

      {error && (
        <p className="text-xs text-red-300" role="alert">
          {error}
        </p>
      )}

      {merges && (
        <div aria-live="polite">
          {merges.length === 0 ? (
            <p className="text-xs text-muted-foreground">No repeated parts found between quotes and invoices.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border text-xs">
              {merges.map((m, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-medium">{m.invoiceLines.join(" + ")}</p>
                    <p className="text-muted-foreground">
                      {"Replaced quote line “"}
                      {m.quoteLine}
                      {"”"}
                      {m.matchedBy === "ai" ? " · matched by AI" : ""}
                    </p>
                  </div>
                  <p className="shrink-0 tabular-nums">
                    {"Quote "}
                    {money(m.quoteAmount)}
                    {" · Invoice "}
                    {money(m.invoiceAmount)}
                    {" → "}
                    <span className="font-semibold text-primary">AED {money(m.finalAmount)}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  )
}

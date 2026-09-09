"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { upsertJobAddon, setJobAddonStatus } from "@/lib/actions-addons"
import { ADDON_TYPES, ADDON_LABELS, ADDON_DESCRIPTIONS, type AddonType, type JobAddon } from "@/lib/addons"
import { Button, Card, Input, Select } from "@/components/ui"
import { formatCurrency, cn } from "@/lib/utils"
import { Sparkles, Droplets, Truck, MapPin, Loader2, Check, CircleDashed } from "lucide-react"

const ICONS: Record<AddonType, React.ComponentType<{ className?: string }>> = {
  washing: Droplets,
  pickup: MapPin,
  delivery: Truck,
}

type Draft = {
  enabled: boolean
  billable: boolean
  price: string
  status: "pending" | "completed"
}

function toDraft(a: JobAddon | undefined): Draft {
  return {
    enabled: a?.enabled ?? false,
    billable: a?.billable ?? true,
    price: a ? String(Number(a.price) || 0) : "0",
    status: a?.status ?? "pending",
  }
}

export function AddonServices({
  jobId,
  addons,
  locked = false,
}: {
  jobId: string
  addons: JobAddon[]
  locked?: boolean
}) {
  const router = useRouter()
  const byType = React.useMemo(() => {
    const m = new Map<AddonType, JobAddon>()
    for (const a of addons) m.set(a.type, a)
    return m
  }, [addons])

  const [drafts, setDrafts] = React.useState<Record<AddonType, Draft>>(() => ({
    washing: toDraft(byType.get("washing")),
    pickup: toDraft(byType.get("pickup")),
    delivery: toDraft(byType.get("delivery")),
  }))
  const [busy, setBusy] = React.useState<AddonType | null>(null)
  const [feedback, setFeedback] = React.useState<{ tone: "ok" | "error"; text: string } | null>(null)

  function update(type: AddonType, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [type]: { ...d[type], ...patch } }))
  }

  async function save(type: AddonType) {
    const d = drafts[type]
    setBusy(type)
    setFeedback(null)
    try {
      await upsertJobAddon({
        jobId,
        type,
        enabled: d.enabled,
        billable: d.billable,
        price: d.billable ? Number(d.price) || 0 : 0,
        status: d.status,
      })
      setFeedback({
        tone: "ok",
        text: locked
          ? `${ADDON_LABELS[type]} saved. Because the quote is approved, this goes to the customer as additional work for re-approval.`
          : `${ADDON_LABELS[type]} saved and added to the quotation.`,
      })
      router.refresh()
    } catch (err) {
      setFeedback({ tone: "error", text: err instanceof Error ? err.message : "Could not save add-on." })
    } finally {
      setBusy(null)
    }
  }

  async function toggleStatus(type: AddonType, next: "pending" | "completed") {
    update(type, { status: next })
    setBusy(type)
    try {
      await setJobAddonStatus(jobId, type, next)
      router.refresh()
    } catch {
      // revert on failure
      update(type, { status: next === "completed" ? "pending" : "completed" })
    } finally {
      setBusy(null)
    }
  }

  const enabledCount = ADDON_TYPES.filter((t) => drafts[t].enabled).length

  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Sparkles className="h-4 w-4" /> Add-on Services
        </h2>
        {enabledCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {enabledCount} active
          </span>
        )}
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Wash, pickup and delivery flow onto the quotation, approval and invoice as one linked line each — no duplicates.
      </p>

      {feedback && (
        <p
          className={cn(
            "mb-3 rounded-lg border px-3 py-2 text-xs",
            feedback.tone === "ok"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
          )}
        >
          {feedback.text}
        </p>
      )}

      <div className="space-y-3">
        {ADDON_TYPES.map((type) => {
          const d = drafts[type]
          const Icon = ICONS[type]
          const saved = byType.get(type)
          const isBusy = busy === type
          const priceNum = d.billable ? Number(d.price) || 0 : 0
          return (
            <div
              key={type}
              className={cn(
                "rounded-lg border p-3 transition-colors",
                d.enabled ? "border-border bg-accent/40" : "border-border/60",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2.5 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={d.enabled}
                    onChange={(e) => update(type, { enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {ADDON_LABELS[type]}
                    <span className="ml-2 hidden text-xs font-normal text-muted-foreground sm:inline">
                      {ADDON_DESCRIPTIONS[type]}
                    </span>
                  </span>
                </label>
                {d.enabled && saved?.enabled && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => toggleStatus(type, d.status === "completed" ? "pending" : "completed")}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                      d.status === "completed"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "border-border text-muted-foreground",
                    )}
                    title="Completion status does not change the charge"
                  >
                    {d.status === "completed" ? (
                      <>
                        <Check className="h-3 w-3" /> Completed
                      </>
                    ) : (
                      <>
                        <CircleDashed className="h-3 w-3" /> Pending
                      </>
                    )}
                  </button>
                )}
              </div>

              {d.enabled && (
                <div className="mt-3 flex flex-wrap items-end gap-3 pl-6">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Charge</label>
                    <Select
                      value={d.billable ? "billable" : "complimentary"}
                      onChange={(e) => update(type, { billable: e.target.value === "billable" })}
                      className="h-9 w-40"
                    >
                      <option value="billable">Billable</option>
                      <option value="complimentary">Complimentary</option>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">Price (AED)</label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={d.billable ? d.price : "0"}
                      disabled={!d.billable}
                      onChange={(e) => update(type, { price: e.target.value })}
                      className="h-9 w-32"
                    />
                  </div>
                  <Button type="button" size="sm" onClick={() => save(type)} disabled={isBusy}>
                    {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Save
                  </Button>
                  <span className="ml-auto text-sm font-medium">
                    {d.billable ? formatCurrency(priceNum) : "Complimentary"}
                  </span>
                </div>
              )}

              {!d.enabled && saved?.enabled && (
                <p className="mt-2 pl-6 text-xs text-amber-600 dark:text-amber-400">
                  Unchecking removes this from the quotation. Click Save to apply.
                </p>
              )}
              {!d.enabled && saved?.enabled && (
                <div className="mt-2 pl-6">
                  <Button type="button" size="sm" variant="outline" onClick={() => save(type)} disabled={isBusy}>
                    {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    Save
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

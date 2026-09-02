"use client"

import * as React from "react"
import { Button, Card, Textarea, Input } from "@/components/ui"
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad"
import { formatCurrency } from "@/lib/utils"
import { Check, X, Car, CheckCircle2, XCircle, Wrench, Package, ShieldCheck } from "lucide-react"

type SnapItem = {
  key: string
  kind: "part" | "labor"
  name: string
  part_number: string | null
  detail: string | null
  category: string | null
  recommendation: "required" | "recommended" | "optional"
  quantity: number
  unit_price: number
  labour_hours: number
  labour_rate: number
  discount: number
  net: number
  vat: number
  gross: number
}

type Data = {
  id: string
  version: number
  kind: "quotation" | "additional_work"
  mode: "per_item" | "whole"
  status: "pending" | "approved" | "rejected" | "partial" | "superseded" | "expired"
  title: string | null
  snapshot: { items: SnapItem[] }
  vat_rate: number
  vat_inclusive: boolean
  subtotal: number
  vat_amount: number
  total: number
  approved_total: number | null
  signer_name: string | null
  decided_at: string | null
  decisions: Record<string, "approved" | "rejected">
  job: {
    job_number: string
    vehicle_make: string | null
    vehicle_model: string | null
    vehicle_year: number | null
    plate_number: string | null
    mileage_in: number | null
  }
  customer: { full_name: string | null; mobile: string | null; email: string | null }
}

const REC_CHIP: Record<SnapItem["recommendation"], string> = {
  required: "border-red-500/30 bg-red-500/10 text-red-300",
  recommended: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  optional: "border-sky-500/30 bg-sky-500/10 text-sky-300",
}
const REC_LABEL: Record<SnapItem["recommendation"], string> = {
  required: "Required",
  recommended: "Recommended",
  optional: "Optional",
}

export function ApprovalRequestView({ token, data }: { token: string; data: Data }) {
  const items = data.snapshot?.items ?? []
  const isWhole = data.mode === "whole"

  // Per-item decisions map (default everything to approved; customer can decline).
  const [decisions, setDecisions] = React.useState<Record<string, "approved" | "rejected">>(() => {
    const init: Record<string, "approved" | "rejected"> = {}
    for (const it of items) init[it.key] = "approved"
    return init
  })
  const [wholeDecision, setWholeDecision] = React.useState<"approved" | "rejected" | null>(null)
  const [signerName, setSignerName] = React.useState(data.customer?.full_name ?? "")
  const [comment, setComment] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<null | "approved" | "rejected" | "partial">(null)
  const sigRef = React.useRef<SignaturePadHandle>(null)

  const vehicle =
    [data.job.vehicle_year, data.job.vehicle_make, data.job.vehicle_model].filter(Boolean).join(" ") || "Your vehicle"

  // Live approved totals (VAT added on top of net, matching the server RPC).
  const approvedNet = React.useMemo(() => {
    if (isWhole) return wholeDecision === "approved" ? items.reduce((s, i) => s + i.net, 0) : 0
    return items.filter((i) => decisions[i.key] === "approved").reduce((s, i) => s + i.net, 0)
  }, [items, decisions, isWhole, wholeDecision])
  const approvedVat = approvedNet * (data.vat_rate / 100)
  const approvedTotal = approvedNet + approvedVat
  const approvedCount = isWhole
    ? wholeDecision === "approved"
      ? items.length
      : 0
    : items.filter((i) => decisions[i.key] === "approved").length

  const grouped = React.useMemo(() => groupByCategory(items), [items])

  function setItem(key: string, d: "approved" | "rejected") {
    setDecisions((prev) => ({ ...prev, [key]: d }))
  }

  async function submit() {
    setError(null)
    if (isWhole && !wholeDecision) {
      setError("Please choose to approve or decline the quotation.")
      return
    }
    if (!signerName.trim()) {
      setError("Please enter your full name to sign.")
      return
    }
    if (!sigRef.current || sigRef.current.isEmpty()) {
      setError("Please sign in the box below to confirm your decision.")
      return
    }
    const payload = isWhole ? { __whole__: wholeDecision } : decisions

    setSubmitting(true)
    try {
      const res = await fetch("/api/approvals/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          decisions: payload,
          signerName: signerName.trim(),
          signature: sigRef.current?.toDataURL(),
          comment,
        }),
      })
      const json = await res.json()
      if (json.ok) {
        setDone(json.status)
      } else if (json.error === "already_decided") {
        setError("This request has already been answered.")
      } else if (json.error === "expired") {
        setError("This approval link has expired. Please contact the workshop for a new one.")
      } else {
        setError("Something went wrong. Please try again.")
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  // Already-decided / non-pending states.
  if (done || data.status !== "pending") {
    const finalStatus = done ?? data.status
    if (finalStatus === "superseded")
      return <Result title="This quotation was updated" text="A newer version of this quotation has been sent to you. Please use the most recent link from the workshop." />
    if (finalStatus === "expired")
      return <Result title="Link expired" text="This approval link has expired. Please contact the workshop for an updated quotation." />
    if (finalStatus === "rejected")
      return <Result title="Quotation declined" text="You have declined this quotation. Our service advisor will contact you to discuss next steps." />
    return (
      <Result
        ok
        title={finalStatus === "partial" ? "Thank you — response received" : "Thank you — approved!"}
        text={
          finalStatus === "partial"
            ? "We've recorded which items you approved. Our team will proceed with the approved work only."
            : "Your approval has been received and signed. Our team will begin work on your vehicle right away."
        }
      />
    )
  }

  return (
    <div className="space-y-5">
      {/* Vehicle header */}
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary">
            <Car className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold">{vehicle}</h1>
            <p className="text-xs text-muted-foreground">
              {data.job.job_number}
              {data.job.plate_number ? ` · ${data.job.plate_number}` : ""}
              {data.job.mileage_in ? ` · ${Number(data.job.mileage_in).toLocaleString()} km` : ""}
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Hello {(data.customer?.full_name ?? "there").split(" ")[0]},{" "}
          {data.kind === "additional_work"
            ? "while working on your vehicle we found additional items that need your approval. Please review each one below."
            : "please review the recommended work below. You can approve or decline each item, then sign to confirm."}
        </p>
        {data.kind === "additional_work" && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
            <Wrench className="h-3.5 w-3.5" /> Additional work request
          </div>
        )}
      </Card>

      {/* Items grouped by category */}
      {grouped.map((group) => (
        <Card key={group.category} className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {group.category}
          </h2>
          <div className="space-y-3">
            {group.items.map((it) => (
              <ItemCard
                key={it.key}
                it={it}
                decision={isWhole ? "approved" : decisions[it.key]}
                disabled={isWhole}
                onDecision={(d) => setItem(it.key, d)}
              />
            ))}
          </div>
        </Card>
      ))}

      {/* Whole-quote all-or-nothing choice */}
      {isWhole && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Your decision</h2>
          <div className="flex gap-2">
            <Button
              onClick={() => setWholeDecision("approved")}
              variant={wholeDecision === "approved" ? "success" : "outline"}
              className="flex-1"
            >
              <Check className="h-4 w-4" /> Approve all
            </Button>
            <Button
              onClick={() => setWholeDecision("rejected")}
              variant={wholeDecision === "rejected" ? "danger" : "outline"}
              className="flex-1"
            >
              <X className="h-4 w-4" /> Decline all
            </Button>
          </div>
        </Card>
      )}

      {/* Live approved total */}
      <Card className="p-5">
        <div className="space-y-1.5 text-sm">
          <Row label={`Approved items`} value={`${approvedCount} of ${items.length}`} />
          <Row label="Approved subtotal (excl. VAT)" value={formatCurrency(approvedNet)} />
          <Row label={`VAT (${data.vat_rate}%)`} value={formatCurrency(approvedVat)} />
          <div className="flex items-center justify-between border-t border-border pt-2 text-lg font-bold">
            <span>Approved total</span>
            <span className="tabular-nums text-primary">{formatCurrency(approvedTotal)}</span>
          </div>
          <p className="pt-1 text-[11px] text-muted-foreground">
            Prices are VAT-{data.vat_inclusive ? "inclusive" : "exclusive"}. You are only charged for items you approve.
          </p>
        </div>
      </Card>

      {/* Sign & submit */}
      <Card className="p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <ShieldCheck className="h-4 w-4" /> Sign to confirm
        </h2>

        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Full name</label>
        <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} placeholder="Your full name" className="mb-3" />

        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Comments (optional)</label>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Any questions or instructions for our team..."
        />

        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            Sign below to authorize your decision
          </label>
          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <SignaturePad ref={sigRef} className="h-40 w-full" />
          </div>
          <button
            type="button"
            onClick={() => sigRef.current?.clear()}
            className="mt-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Clear signature
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <Button onClick={submit} disabled={submitting} className="mt-5 w-full" size="lg">
          <Check className="h-4 w-4" /> {submitting ? "Submitting..." : "Confirm & sign"}
        </Button>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          By signing you confirm your decision on the items above. Your signature, name and time are recorded.
        </p>
      </Card>
    </div>
  )
}

function groupByCategory(items: SnapItem[]) {
  const map = new Map<string, SnapItem[]>()
  for (const it of items) {
    const cat = it.category?.trim() || (it.kind === "part" ? "Parts" : "Labour & Services")
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push(it)
  }
  return Array.from(map.entries()).map(([category, items]) => ({ category, items }))
}

function ItemCard({
  it,
  decision,
  disabled,
  onDecision,
}: {
  it: SnapItem
  decision: "approved" | "rejected"
  disabled: boolean
  onDecision: (d: "approved" | "rejected") => void
}) {
  const rejected = decision === "rejected"
  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        rejected ? "border-border bg-background/20 opacity-60" : "border-border bg-background/40"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-foreground">
              {it.kind === "part" ? <Package className="h-3.5 w-3.5 text-muted-foreground" /> : <Wrench className="h-3.5 w-3.5 text-muted-foreground" />}
              {it.name}
            </span>
            {it.part_number && (
              <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                #{it.part_number}
              </span>
            )}
            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${REC_CHIP[it.recommendation]}`}>
              {REC_LABEL[it.recommendation]}
            </span>
          </div>
        </div>
        <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(it.gross)}</span>
      </div>

      {it.detail && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{it.detail}</p>}

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {it.kind === "part" ? (
          <span>
            {it.quantity} × {formatCurrency(it.unit_price)}
          </span>
        ) : (
          <>
            {it.labour_hours > 0 && <span>{it.labour_hours} hrs</span>}
            <span>Rate {formatCurrency(it.labour_rate)}</span>
          </>
        )}
        {it.discount > 0 && <span className="text-amber-500">Discount − {formatCurrency(it.discount)}</span>}
      </div>

      {!disabled && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onDecision("approved")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              decision === "approved"
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            <Check className="h-3.5 w-3.5" /> Approve
          </button>
          <button
            type="button"
            onClick={() => onDecision("rejected")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              decision === "rejected"
                ? "border-red-500/40 bg-red-500/15 text-red-300"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            <X className="h-3.5 w-3.5" /> Decline
          </button>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  )
}

function Result({ ok, title, text }: { ok?: boolean; title: string; text: string }) {
  return (
    <Card className="p-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
        {ok ? <CheckCircle2 className="h-8 w-8 text-emerald-400" /> : <XCircle className="h-8 w-8 text-red-400" />}
      </div>
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{text}</p>
    </Card>
  )
}

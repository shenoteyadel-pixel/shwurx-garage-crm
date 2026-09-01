"use client"

import * as React from "react"
import { Button, Card, Textarea } from "@/components/ui"
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad"
import { formatCurrency } from "@/lib/utils"
import { Check, X, Car, CheckCircle2, XCircle } from "lucide-react"

type Data = {
  job: {
    job_number: string
    customer_name: string
    vehicle_make: string | null
    vehicle_model: string | null
    vehicle_year: number | null
    plate_number: string | null
    mileage: number | null
    approval_status: "pending" | "approved" | "rejected"
  }
  photos: { url: string; kind: string; caption: string | null }[]
  quotation: null | {
    description: string | null
    vat_rate: number
    parts_total: number
    labor_total: number
    discount_total: number
    subtotal: number
    vat_amount: number
    total: number
    items: {
      kind: string
      name: string | null
      detail: string | null
      description: string | null
      quantity: number
      unit_price: number
      labor: number
      discount: number
      line_total: number
    }[]
  }
}

export function ApprovalView({ token, data }: { token: string; data: Data }) {
  const [status, setStatus] = React.useState(data.job.approval_status)
  const [decision, setDecision] = React.useState<"approved" | "rejected" | null>(null)
  const [comment, setComment] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const sigRef = React.useRef<SignaturePadHandle>(null)

  const vehicle =
    [data.job.vehicle_year, data.job.vehicle_make, data.job.vehicle_model].filter(Boolean).join(" ") || "Your vehicle"

  async function submit(d: "approved" | "rejected") {
    setError(null)
    if (d === "approved" && (!sigRef.current || sigRef.current.isEmpty())) {
      setError("Please sign in the box to confirm your approval.")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          decision: d,
          comment,
          signature: d === "approved" ? sigRef.current?.toDataURL() : null,
        }),
      })
      const json = await res.json()
      if (json.ok) {
        setStatus(d)
      } else {
        setError(json.error === "already_decided" ? "This request has already been answered." : "Something went wrong. Please try again.")
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (status === "approved") {
    return <Result ok title="Thank you — Approved!" text="Your approval has been received. Our team will begin work on your vehicle right away." />
  }
  if (status === "rejected") {
    return <Result title="Quotation Declined" text="You have declined this quotation. Our service advisor will contact you to discuss the next steps." />
  }

  return (
    <div className="space-y-5">
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
              {data.job.mileage ? ` · ${data.job.mileage.toLocaleString()} km` : ""}
            </p>
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Hello {data.job.customer_name.split(" ")[0]}, please review the inspection photos and quotation below, then
          approve or decline.
        </p>
      </Card>

      {data.photos.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Vehicle & inspection photos
          </h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.photos.map((p, i) => (
              <div key={i} className="relative aspect-square overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url || "/placeholder.svg"} alt={p.caption || "Vehicle photo"} className="h-full w-full object-cover" />
                {p.kind === "damage" && (
                  <span className="absolute left-1 top-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-medium text-white">
                    Damage
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {data.quotation && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Quotation</h2>

          {data.quotation.description && (
            <div className="mb-4 rounded-lg border border-border bg-background/40 p-4">
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Work description
              </div>
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">
                {data.quotation.description}
              </p>
            </div>
          )}

          <div className="space-y-3">
            {data.quotation.items.map((it, i) => (
              <div key={i} className="rounded-lg border border-border bg-background/40 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-medium text-foreground">
                        {it.name || it.description || "Item"}
                      </span>
                      <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {it.kind}
                      </span>
                    </div>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(it.line_total)}</span>
                </div>
                {it.detail && (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                    {it.detail}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {it.quantity} × {formatCurrency(it.unit_price)}
                  </span>
                  {it.labor > 0 && <span>Labor {formatCurrency(it.labor)}</span>}
                  {it.discount > 0 && <span className="text-amber-500">Discount − {formatCurrency(it.discount)}</span>}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-1.5 border-t border-border pt-3 text-sm">
            <Row label="Parts" value={formatCurrency(data.quotation.parts_total)} />
            <Row label="Labor" value={formatCurrency(data.quotation.labor_total)} />
            {data.quotation.discount_total > 0 && (
              <Row label="Discount" value={`− ${formatCurrency(data.quotation.discount_total)}`} />
            )}
            <Row label="Subtotal" value={formatCurrency(data.quotation.subtotal)} />
            <Row label={`VAT (${data.quotation.vat_rate}%)`} value={formatCurrency(data.quotation.vat_amount)} />
            <div className="flex items-center justify-between border-t border-border pt-2 text-lg font-bold">
              <span>Total</span>
              <span className="tabular-nums text-primary">{formatCurrency(data.quotation.total)}</span>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Your decision</h2>

        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Comments (optional)</label>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Any questions or instructions for our team..."
        />

        {decision === "approved" && (
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Sign below to authorize the repair
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
        )}

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          {decision === "approved" ? (
            <Button onClick={() => submit("approved")} disabled={submitting} variant="success" className="flex-1" size="lg">
              <Check className="h-4 w-4" /> {submitting ? "Submitting..." : "Confirm Approval"}
            </Button>
          ) : (
            <Button onClick={() => setDecision("approved")} variant="success" className="flex-1" size="lg">
              <Check className="h-4 w-4" /> Approve
            </Button>
          )}
          {decision === "rejected" ? (
            <Button onClick={() => submit("rejected")} disabled={submitting} variant="danger" className="flex-1" size="lg">
              <X className="h-4 w-4" /> {submitting ? "Submitting..." : "Confirm Decline"}
            </Button>
          ) : (
            <Button onClick={() => setDecision("rejected")} variant="outline" className="flex-1" size="lg">
              <X className="h-4 w-4" /> Decline
            </Button>
          )}
        </div>
        {decision && (
          <button
            type="button"
            onClick={() => setDecision(null)}
            className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        )}
      </Card>
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

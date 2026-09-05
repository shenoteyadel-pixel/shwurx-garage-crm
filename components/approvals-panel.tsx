"use client"

import * as React from "react"
import Link from "next/link"
import { Button, Card, Input, Badge } from "@/components/ui"
import {
  createApprovalRequest,
  createAdditionalWorkRequest,
  resendApprovalEmail,
  getApprovalWhatsAppLink,
  type JobApproval,
} from "@/lib/actions-approvals"
import { formatCurrency } from "@/lib/utils"
import { Copy, Check, Send, RefreshCw, FileCheck, Plus, Trash2, ScrollText, MessageCircle } from "lucide-react"

const STATUS_META: Record<string, { label: string; chip: string }> = {
  pending: { label: "Awaiting customer", chip: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  approved: { label: "Approved", chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  partial: { label: "Partially approved", chip: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
  rejected: { label: "Declined", chip: "border-red-500/30 bg-red-500/10 text-red-300" },
  superseded: { label: "Superseded", chip: "border-border bg-muted text-muted-foreground" },
  expired: { label: "Expired", chip: "border-border bg-muted text-muted-foreground" },
}

type AwItem = {
  kind: "part" | "labor"
  name: string
  detail: string
  category: string
  recommendation: "required" | "recommended" | "optional"
  quantity: number
  unit_price: number
  labour_rate: number
}

function emptyAw(kind: AwItem["kind"]): AwItem {
  return { kind, name: "", detail: "", category: "", recommendation: "recommended", quantity: 1, unit_price: 0, labour_rate: 0 }
}

export function ApprovalsPanel({
  jobId,
  approvals,
  hasQuotation,
  vatRate,
  vatInclusive,
  quoteChanged = false,
}: {
  jobId: string
  approvals: JobApproval[]
  hasQuotation: boolean
  vatRate: number
  vatInclusive: boolean
  quoteChanged?: boolean
}) {
  const [busy, setBusy] = React.useState<string | null>(null)
  const [msg, setMsg] = React.useState<string | null>(null)
  const [copiedId, setCopiedId] = React.useState<string | null>(null)
  const [awOpen, setAwOpen] = React.useState(false)
  const [awTitle, setAwTitle] = React.useState("Additional work")
  const [awItems, setAwItems] = React.useState<AwItem[]>([emptyAw("part")])

  function linkFor(token: string) {
    if (typeof window === "undefined") return ""
    return `${window.location.origin}/approve/r/${token}`
  }

  async function copy(token: string, id: string) {
    await navigator.clipboard.writeText(linkFor(token))
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1800)
  }

  async function send(mode: "per_item" | "whole") {
    setBusy(mode)
    setMsg(null)
    try {
      const res = await createApprovalRequest(jobId, { mode })
      if (!res.ok) {
        setMsg(res.error === "no_quotation" ? "Save a quotation with line items first." : "Could not create request.")
      } else {
        setMsg(res.emailed ? "Approval request sent to the customer by email." : "Approval request created. Copy the link to share it.")
      }
    } finally {
      setBusy(null)
    }
  }

  async function resend(id: string) {
    setBusy(id)
    setMsg(null)
    try {
      const res = await resendApprovalEmail(id)
      setMsg(res.ok && res.emailed ? "Email re-sent to the customer." : "Could not re-send email (no customer email on file?).")
    } finally {
      setBusy(null)
    }
  }

  async function whatsapp(id: string) {
    setBusy(`wa-${id}`)
    setMsg(null)
    try {
      const res = await getApprovalWhatsAppLink(id)
      if (res.ok && res.url) {
        window.open(res.url, "_blank", "noopener,noreferrer")
      } else {
        setMsg(res.error === "no_mobile" ? "No customer mobile number on file." : "Could not open WhatsApp.")
      }
    } finally {
      setBusy(null)
    }
  }

  async function submitAw() {
    setBusy("aw")
    setMsg(null)
    try {
      const res = await createAdditionalWorkRequest(jobId, {
        title: awTitle,
        vatInclusive,
        vatRate,
        items: awItems.map((i) => ({
          kind: i.kind,
          name: i.name,
          detail: i.detail,
          category: i.category,
          recommendation: i.recommendation,
          quantity: i.quantity,
          unit_price: i.unit_price,
          labour_rate: i.labour_rate,
        })),
      })
      if (!res.ok) {
        setMsg(res.error === "no_items" ? "Add at least one item with a name." : "Could not create request.")
      } else {
        setMsg(res.emailed ? "Additional-work request sent to the customer." : "Additional-work request created. Copy the link to share.")
        setAwOpen(false)
        setAwItems([emptyAw("part")])
        setAwTitle("Additional work")
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Customer Approvals</h2>
        <ScrollText className="h-4 w-4 text-muted-foreground" />
      </div>

      {!hasQuotation && (
        <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300">
          Save a quotation first so the customer has something to approve.
        </p>
      )}

      {hasQuotation && quoteChanged && (
        <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-300">
          The quotation has changed since the version the customer received, and their link is locked (they&apos;ve
          already signed or started responding). Click <strong>Send for approval</strong> to send them an updated
          version.
        </p>
      )}

      {/* Send actions */}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => send("per_item")} disabled={busy !== null || !hasQuotation}>
          <Send className="h-4 w-4" />
          {busy === "per_item" ? "Sending…" : "Send for approval"}
        </Button>
        <Button type="button" variant="outline" onClick={() => send("whole")} disabled={busy !== null || !hasQuotation}>
          Whole quote
        </Button>
        <Button type="button" variant="outline" onClick={() => setAwOpen((v) => !v)} disabled={busy !== null}>
          <Plus className="h-4 w-4" /> Additional work
        </Button>
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        &ldquo;Send for approval&rdquo; lets the customer approve or decline each item and sign. The link stays the same and
        auto-updates with any quote changes until they respond. &ldquo;Whole quote&rdquo; is all-or-nothing.
      </p>

      {/* Additional-work inline form */}
      {awOpen && (
        <div className="mt-4 rounded-xl border border-border bg-background/50 p-4">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Request title</label>
          <Input value={awTitle} onChange={(e) => setAwTitle(e.target.value)} placeholder="e.g. Brake pads found worn" />

          <div className="mt-3 space-y-3">
            {awItems.map((it, idx) => (
              <div key={idx} className="rounded-lg border border-border bg-card/60 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <select
                    value={it.kind}
                    onChange={(e) =>
                      setAwItems((prev) => prev.map((x, i) => (i === idx ? { ...x, kind: e.target.value as AwItem["kind"] } : x)))
                    }
                    className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
                  >
                    <option value="part">Part</option>
                    <option value="labor">Labour</option>
                  </select>
                  <Input
                    value={it.name}
                    onChange={(e) => setAwItems((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))}
                    placeholder={it.kind === "part" ? "Part name" : "Labour / service"}
                    className="h-9 flex-1"
                  />
                  {awItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setAwItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-red-400"
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Input
                    value={it.category}
                    onChange={(e) => setAwItems((prev) => prev.map((x, i) => (i === idx ? { ...x, category: e.target.value } : x)))}
                    placeholder="Category"
                    className="h-9"
                  />
                  <select
                    value={it.recommendation}
                    onChange={(e) =>
                      setAwItems((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, recommendation: e.target.value as AwItem["recommendation"] } : x)),
                      )
                    }
                    className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
                  >
                    <option value="required">Required</option>
                    <option value="recommended">Recommended</option>
                    <option value="optional">Optional</option>
                  </select>
                  {it.kind === "part" ? (
                    <>
                      <Input
                        type="number"
                        value={it.quantity}
                        onChange={(e) => setAwItems((prev) => prev.map((x, i) => (i === idx ? { ...x, quantity: Number(e.target.value) } : x)))}
                        placeholder="Qty"
                        className="h-9"
                      />
                      <Input
                        type="number"
                        value={it.unit_price}
                        onChange={(e) => setAwItems((prev) => prev.map((x, i) => (i === idx ? { ...x, unit_price: Number(e.target.value) } : x)))}
                        placeholder="Unit price"
                        className="h-9"
                      />
                    </>
                  ) : (
                    <Input
                      type="number"
                      value={it.labour_rate}
                      onChange={(e) => setAwItems((prev) => prev.map((x, i) => (i === idx ? { ...x, labour_rate: Number(e.target.value) } : x)))}
                      placeholder="Labour charge"
                      className="col-span-2 h-9"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAwItems((prev) => [...prev, emptyAw("part")])}>
              <Plus className="h-3.5 w-3.5" /> Add item
            </Button>
            <Button type="button" size="sm" onClick={submitAw} disabled={busy !== null}>
              {busy === "aw" ? "Creating…" : "Create & send"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAwOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {msg && <p className="mt-3 rounded-lg border border-border bg-background/60 p-2.5 text-xs text-muted-foreground">{msg}</p>}

      {/* Request history */}
      {approvals.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-border pt-4">
          {approvals.map((a) => {
            const meta = STATUS_META[a.status] ?? STATUS_META.pending
            return (
              <div key={a.id} className="rounded-lg border border-border bg-background/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {a.kind === "additional_work" ? a.title || "Additional work" : "Quotation"}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">v{a.version}</span>
                      <Badge className={meta.chip}>{meta.label}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span>{a.itemCount} items</span>
                      <span>Total {formatCurrency(a.total)}</span>
                      {a.approvedTotal != null && (a.status === "approved" || a.status === "partial") && (
                        <span className="text-emerald-400">Approved {formatCurrency(a.approvedTotal)}</span>
                      )}
                      {a.signerName && <span>Signed by {a.signerName}</span>}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button type="button" variant="outline" size="sm" onClick={() => copy(a.token, a.id)}>
                    {copiedId === a.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedId === a.id ? "Copied" : "Copy link"}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => whatsapp(a.id)} disabled={busy !== null}>
                    <MessageCircle className="h-3.5 w-3.5" />
                    {busy === `wa-${a.id}` ? "Opening…" : "WhatsApp"}
                  </Button>
                  {a.status === "pending" && (
                    <Button type="button" variant="outline" size="sm" onClick={() => resend(a.id)} disabled={busy !== null}>
                      <RefreshCw className="h-3.5 w-3.5" /> Resend
                    </Button>
                  )}
                  {(a.status === "approved" || a.status === "partial" || a.status === "rejected") && (
                    <Link href={`/jobs/${jobId}/approval/${a.id}/certificate`} target="_blank">
                      <Button type="button" variant="outline" size="sm">
                        <FileCheck className="h-3.5 w-3.5" /> Certificate
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

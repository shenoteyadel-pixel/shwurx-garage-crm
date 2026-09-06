"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Card, Button, Input, Select, Label, Badge } from "@/components/ui"
import { formatCurrency, formatDate } from "@/lib/utils"
import { suggestSalePrice, marginPct, type PricingMethod } from "@/lib/pricing"
import {
  saveInvoiceDraft,
  confirmSupplierInvoice,
  recordSupplierInvoicePayment,
  deleteInvoiceDraft,
  type DraftLine,
} from "@/lib/actions-invoices"
import { Loader2, Save, CheckCircle2, Trash2, AlertTriangle, Plus, FileText } from "lucide-react"

type SupplierOpt = { id: string; name: string }
type InventoryOpt = { id: string; name: string; sku: string | null; cost_price: number }

export type InvoiceHeader = {
  id: string
  doc_number: string | null
  status: "draft" | "confirmed" | "void"
  payment_status: "unpaid" | "partial" | "paid"
  supplier_id: string | null
  supplier_name_raw: string | null
  invoice_number: string | null
  invoice_date: string | null
  currency: string
  subtotal: number
  vat_amount: number
  total: number
  amount_paid: number
  ocr_confidence: number | null
  notes: string | null
  blob_pathname: string | null
  file_type: string | null
}

export type InvoiceItemRow = {
  id: string
  description: string
  sku: string | null
  quantity: number
  unit: string
  unit_cost: number
  vat_rate: number
  inventory_item_id: string | null
  match_status: "new" | "matched" | "ignore"
  suggested_sale_price: number
  markup_pct: number
  confidence: number | null
}

type Line = DraftLine & { key: string; confidence: number | null }

export function InvoiceReview({
  invoice,
  items,
  suppliers,
  inventory,
  pricing,
  payments,
}: {
  invoice: InvoiceHeader
  items: InvoiceItemRow[]
  suppliers: SupplierOpt[]
  inventory: InventoryOpt[]
  pricing: { method: PricingMethod; markup: number; vat: number }
  payments: { id: string; amount: number; method: string; reference: string | null; paid_at: string }[]
}) {
  const router = useRouter()
  const readOnly = invoice.status !== "draft"

  const [supplierId, setSupplierId] = React.useState(invoice.supplier_id ?? "")
  const [invoiceNumber, setInvoiceNumber] = React.useState(invoice.invoice_number ?? "")
  const [invoiceDate, setInvoiceDate] = React.useState(invoice.invoice_date ?? "")
  const [notes, setNotes] = React.useState(invoice.notes ?? "")
  const [lines, setLines] = React.useState<Line[]>(
    items.map((it) => ({
      key: it.id,
      description: it.description,
      sku: it.sku,
      quantity: it.quantity,
      unit: it.unit,
      unit_cost: it.unit_cost,
      vat_rate: it.vat_rate,
      inventory_item_id: it.inventory_item_id,
      match_status: it.match_status,
      suggested_sale_price: it.suggested_sale_price,
      markup_pct: it.markup_pct || pricing.markup,
      confidence: it.confidence,
    })),
  )
  const [pending, start] = React.useTransition()
  const [action, setAction] = React.useState<"save" | "confirm" | "delete" | null>(null)
  const [err, setErr] = React.useState<string | null>(null)

  function patchLine(key: string, patch: Partial<Line>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l
        const next = { ...l, ...patch }
        // Re-derive suggested sale price when cost or markup changes.
        if ("unit_cost" in patch || "markup_pct" in patch) {
          next.suggested_sale_price = suggestSalePrice(next.unit_cost, pricing.method, next.markup_pct)
        }
        return next
      }),
    )
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}`,
        description: "",
        sku: null,
        quantity: 1,
        unit: "pcs",
        unit_cost: 0,
        vat_rate: pricing.vat,
        inventory_item_id: null,
        match_status: "new",
        suggested_sale_price: 0,
        markup_pct: pricing.markup,
        confidence: null,
      },
    ])
  }

  const subtotal = lines
    .filter((l) => l.match_status !== "ignore")
    .reduce((t, l) => t + Number(l.quantity) * Number(l.unit_cost), 0)
  const vat = lines
    .filter((l) => l.match_status !== "ignore")
    .reduce((t, l) => t + (Number(l.quantity) * Number(l.unit_cost) * Number(l.vat_rate)) / 100, 0)
  const total = subtotal + vat
  const lowConfidence = invoice.ocr_confidence !== null && invoice.ocr_confidence < 0.6

  function toDraftLines(): DraftLine[] {
    return lines.map((l) => ({
      description: l.description,
      sku: l.sku,
      quantity: Number(l.quantity),
      unit: l.unit,
      unit_cost: Number(l.unit_cost),
      vat_rate: Number(l.vat_rate),
      inventory_item_id: l.inventory_item_id,
      match_status: l.match_status,
      suggested_sale_price: Number(l.suggested_sale_price),
      markup_pct: Number(l.markup_pct),
    }))
  }

  function save(then?: () => void) {
    setErr(null)
    setAction("save")
    start(async () => {
      try {
        await saveInvoiceDraft({
          id: invoice.id,
          supplierId: supplierId || null,
          invoiceNumber: invoiceNumber || null,
          invoiceDate: invoiceDate || null,
          notes: notes || null,
          lines: toDraftLines(),
        })
        if (then) then()
        else router.refresh()
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not save")
      } finally {
        setAction(null)
      }
    })
  }

  function confirm() {
    if (!supplierId) {
      setErr("Select a supplier before confirming")
      return
    }
    setErr(null)
    setAction("confirm")
    start(async () => {
      try {
        // Persist current edits first, then post to stock + ledger.
        await saveInvoiceDraft({
          id: invoice.id,
          supplierId,
          invoiceNumber: invoiceNumber || null,
          invoiceDate: invoiceDate || null,
          notes: notes || null,
          lines: toDraftLines(),
        })
        await confirmSupplierInvoice(invoice.id)
        router.refresh()
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not confirm")
      } finally {
        setAction(null)
      }
    })
  }

  function remove() {
    if (!window.confirm("Delete this draft and its uploaded file? This cannot be undone.")) return
    setAction("delete")
    start(async () => {
      try {
        await deleteInvoiceDraft(invoice.id)
        router.push("/purchasing/invoices")
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Could not delete")
        setAction(null)
      }
    })
  }

  const fileUrl = invoice.blob_pathname ? `/api/file?pathname=${encodeURIComponent(invoice.blob_pathname)}` : null
  const isPdf = (invoice.file_type ?? "").includes("pdf")

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">
                {invoice.doc_number || "Supplier Invoice"}
              </h1>
              <StatusBadge status={invoice.status} />
              {readOnly && <PayBadge status={invoice.payment_status} />}
            </div>
            <p className="text-sm text-muted-foreground">
              {invoice.supplier_name_raw ? `Scanned as “${invoice.supplier_name_raw}”` : "Review the extracted details"}
              {invoice.ocr_confidence !== null && ` · OCR confidence ${Math.round(invoice.ocr_confidence * 100)}%`}
            </p>
          </div>
          {!readOnly && (
            <Button variant="ghost" size="sm" onClick={remove} disabled={pending} className="text-red-400">
              {action === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete draft
            </Button>
          )}
        </div>

        {lowConfidence && !readOnly && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Low OCR confidence — please double-check every field below.
          </div>
        )}
        {err && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {err}
          </div>
        )}

        {/* Invoice details */}
        <Card className="p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="supplier">Supplier</Label>
              <Select id="supplier" value={supplierId} disabled={readOnly} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— Select supplier —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="inv-no">Supplier invoice #</Label>
              <Input id="inv-no" value={invoiceNumber} disabled={readOnly} onChange={(e) => setInvoiceNumber(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="inv-date">Invoice date</Label>
              <Input id="inv-date" type="date" value={invoiceDate ?? ""} disabled={readOnly} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" value={notes} disabled={readOnly} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
        </Card>

        {/* Line items */}
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Line items</h2>
            {!readOnly && (
              <Button variant="outline" size="sm" onClick={addLine}>
                <Plus className="h-4 w-4" /> Add line
              </Button>
            )}
          </div>
          <div className="divide-y divide-border/60">
            {lines.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">No line items.</p>}
            {lines.map((l) => (
              <LineRow
                key={l.key}
                line={l}
                readOnly={readOnly}
                inventory={inventory}
                onChange={(patch) => patchLine(l.key, patch)}
                onRemove={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
              />
            ))}
          </div>
        </Card>
      </div>

      {/* Right column: totals, actions, original file */}
      <div className="space-y-6">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Totals</h2>
          <dl className="space-y-2 text-sm">
            <Row label="Subtotal (excl. VAT)" value={formatCurrency(subtotal)} />
            <Row label="Input VAT" value={formatCurrency(vat)} />
            <div className="my-2 border-t border-border" />
            <Row label="Total" value={formatCurrency(total)} strong />
            {readOnly && (
              <>
                <Row label="Paid" value={formatCurrency(invoice.amount_paid)} />
                <Row label="Balance" value={formatCurrency(invoice.total - invoice.amount_paid)} strong />
              </>
            )}
          </dl>

          {!readOnly ? (
            <div className="mt-4 space-y-2">
              <Button className="w-full" onClick={confirm} disabled={pending}>
                {action === "confirm" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirm &amp; add to stock
              </Button>
              <Button variant="outline" className="w-full" onClick={() => save()} disabled={pending}>
                {action === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save draft
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Confirming updates inventory quantities, cost &amp; sale prices, and the supplier ledger.
              </p>
            </div>
          ) : (
            <p className="mt-4 rounded-lg bg-muted/50 px-3 py-2 text-center text-xs text-muted-foreground">
              Confirmed {invoice.doc_number ? `as ${invoice.doc_number}` : ""} — stock and ledger updated.
            </p>
          )}
        </Card>

        {readOnly && invoice.status === "confirmed" && (
          <PaymentPanel invoice={invoice} payments={payments} />
        )}

        {fileUrl && (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <FileText className="h-4 w-4" /> Original
              </h2>
              <a href={fileUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                Open
              </a>
            </div>
            {isPdf ? (
              <iframe src={fileUrl} title="Original invoice" className="h-96 w-full bg-white" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl || "/placeholder.svg"} alt="Original supplier invoice" className="max-h-[520px] w-full object-contain bg-white" />
            )}
          </Card>
        )}
      </div>
    </div>
  )
}

function LineRow({
  line,
  readOnly,
  inventory,
  onChange,
  onRemove,
}: {
  line: Line
  readOnly: boolean
  inventory: InventoryOpt[]
  onChange: (patch: Partial<Line>) => void
  onRemove: () => void
}) {
  const margin = marginPct(line.unit_cost, line.suggested_sale_price)
  return (
    <div className={`px-4 py-3 ${line.match_status === "ignore" ? "opacity-50" : ""}`}>
      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-12 sm:col-span-5">
          <Input
            value={line.description}
            disabled={readOnly}
            placeholder="Description"
            onChange={(e) => onChange({ description: e.target.value })}
          />
          <input
            value={line.sku ?? ""}
            disabled={readOnly}
            placeholder="Part # / SKU"
            onChange={(e) => onChange({ sku: e.target.value || null })}
            className="mt-1 h-8 w-full rounded-md border border-input bg-background/60 px-2 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-100"
          />
        </div>
        <NumCell label="Qty" value={line.quantity} disabled={readOnly} onChange={(v) => onChange({ quantity: v })} />
        <NumCell label="Unit cost" value={line.unit_cost} disabled={readOnly} onChange={(v) => onChange({ unit_cost: v })} />
        <div className="col-span-6 sm:col-span-2">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Line total</span>
          <div className="flex h-10 items-center px-1 text-sm tabular-nums">
            {formatCurrency(Number(line.quantity) * Number(line.unit_cost))}
          </div>
        </div>
        <div className="col-span-6 sm:col-span-1 flex items-end justify-end">
          {!readOnly && (
            <button onClick={onRemove} aria-label="Remove line" className="p-2 text-muted-foreground hover:text-red-400">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Match + pricing controls */}
      <div className="mt-2 grid grid-cols-12 items-end gap-2">
        <div className="col-span-12 sm:col-span-5">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">Inventory</span>
          <Select
            value={line.match_status === "ignore" ? "__ignore" : line.inventory_item_id ?? "__new"}
            disabled={readOnly}
            onChange={(e) => {
              const v = e.target.value
              if (v === "__ignore") onChange({ match_status: "ignore" })
              else if (v === "__new") onChange({ match_status: "new", inventory_item_id: null })
              else {
                const item = inventory.find((i) => i.id === v)
                onChange({ match_status: "matched", inventory_item_id: v, ...(item ? { sku: item.sku ?? line.sku } : {}) })
              }
            }}
            className="text-xs"
          >
            <option value="__new">+ Create new part</option>
            <option value="__ignore">Ignore (don&apos;t stock)</option>
            <optgroup label="Match existing">
              {inventory.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                  {i.sku ? ` · ${i.sku}` : ""}
                </option>
              ))}
            </optgroup>
          </Select>
        </div>
        <NumCell
          label="Markup %"
          value={line.markup_pct}
          disabled={readOnly || line.match_status === "ignore"}
          onChange={(v) => onChange({ markup_pct: v })}
        />
        <NumCell
          label="Sale price"
          value={line.suggested_sale_price}
          disabled={readOnly || line.match_status === "ignore"}
          onChange={(v) => onChange({ suggested_sale_price: v })}
        />
        <div className="col-span-12 sm:col-span-3 flex items-center gap-2 pb-2">
          {line.match_status !== "ignore" && (
            <span className="text-[10px] text-muted-foreground">{margin}% margin</span>
          )}
          {line.confidence !== null && line.confidence < 0.6 && (
            <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-300">check</Badge>
          )}
        </div>
      </div>
    </div>
  )
}

function NumCell({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string
  value: number
  disabled?: boolean
  onChange: (v: number) => void
}) {
  return (
    <div className="col-span-6 sm:col-span-2">
      <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <Input
        type="number"
        step="0.01"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="tabular-nums"
      />
    </div>
  )
}

function PaymentPanel({
  invoice,
  payments,
}: {
  invoice: InvoiceHeader
  payments: { id: string; amount: number; method: string; reference: string | null; paid_at: string }[]
}) {
  const [pending, start] = React.useTransition()
  const balance = invoice.total - invoice.amount_paid
  const paid = invoice.payment_status === "paid"

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Payments</h2>
      {payments.length > 0 && (
        <ul className="mb-3 space-y-1.5 text-sm">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between">
              <span className="text-muted-foreground">
                {formatDate(p.paid_at)} · {p.method}
              </span>
              <span className="tabular-nums">{formatCurrency(p.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      {paid ? (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-center text-sm text-emerald-400">Fully paid</p>
      ) : (
        <form
          action={(fd) =>
            start(async () => {
              await recordSupplierInvoicePayment(invoice.id, fd)
            })
          }
          className="space-y-2"
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="amount">Amount</Label>
              <Input id="amount" name="amount" type="number" step="0.01" defaultValue={balance.toFixed(2)} required />
            </div>
            <div>
              <Label htmlFor="method">Method</Label>
              <Select id="method" name="method" defaultValue="bank_transfer">
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank transfer</option>
                <option value="cheque">Cheque</option>
                <option value="card">Card</option>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="paid_at">Date</Label>
              <Input id="paid_at" name="paid_at" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
            <div>
              <Label htmlFor="reference">Reference</Label>
              <Input id="reference" name="reference" placeholder="Txn / cheque #" />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Record payment
          </Button>
        </form>
      )}
    </Card>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? "font-semibold tabular-nums" : "tabular-nums"}>{value}</dd>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "border-amber-500/30 bg-amber-500/15 text-amber-300",
    confirmed: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
    void: "border-red-500/30 bg-red-500/15 text-red-300",
  }
  return <Badge className={map[status] ?? map.draft}>{status}</Badge>
}

function PayBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    unpaid: "border-red-500/30 bg-red-500/15 text-red-300",
    partial: "border-amber-500/30 bg-amber-500/15 text-amber-300",
    paid: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  }
  return <Badge className={map[status] ?? map.unpaid}>{status}</Badge>
}

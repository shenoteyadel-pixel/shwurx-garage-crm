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
  setSupplierInvoiceOnAccount,
  deleteInvoiceDraft,
  type DraftLine,
} from "@/lib/actions-invoices"
import { Loader2, Save, CheckCircle2, Trash2, AlertTriangle, Plus, FileText } from "lucide-react"

type SupplierOpt = { id: string; name: string }
type JobOpt = { id: string; label: string }
type InventoryOpt = {
  id: string
  name: string
  cost_price: number
  crm_part_id: string | null
  oem_part_number: string | null
  supplier_part_number: string | null
}

/** Case- and separator-insensitive part-number key for matching. */
const normPN = (v: string | null | undefined) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")

export type SupplierContact = {
  trn: string | null
  phone: string | null
  email: string | null
  address: string | null
}

export type InvoiceHeader = {
  id: string
  doc_number: string | null
  status: "draft" | "confirmed" | "void"
  payment_status: "unpaid" | "partial" | "paid" | "credit"
  supplier_id: string | null
  supplier_name_raw: string | null
  supplier_contact: SupplierContact | null
  invoice_number: string | null
  invoice_date: string | null
  currency: string
  subtotal: number
  discount_amount: number
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
  oem_part_number: string | null
  supplier_part_number: string | null
  quantity: number
  unit: string
  unit_cost: number
  vat_rate: number
  inventory_item_id: string | null
  match_status: "new" | "matched" | "ignore"
  job_id: string | null
  parts_request_id: string | null
  suggested_job_label: string | null
  suggested_sale_price: number
  markup_pct: number
  confidence: number | null
}

type Line = DraftLine & { key: string; confidence: number | null; suggested_job_label: string | null }

export function InvoiceReview({
  invoice,
  items,
  suppliers,
  inventory,
  jobs,
  pricing,
  payments,
}: {
  invoice: InvoiceHeader
  items: InvoiceItemRow[]
  suppliers: SupplierOpt[]
  inventory: InventoryOpt[]
  jobs: JobOpt[]
  pricing: { method: PricingMethod; markup: number; vat: number }
  payments: { id: string; amount: number; method: string; reference: string | null; paid_at: string }[]
}) {
  const router = useRouter()
  const readOnly = invoice.status !== "draft"

  const [supplierId, setSupplierId] = React.useState(invoice.supplier_id ?? "")
  const [invoiceNumber, setInvoiceNumber] = React.useState(invoice.invoice_number ?? "")
  const [invoiceDate, setInvoiceDate] = React.useState(invoice.invoice_date ?? "")
  const [discountAmount, setDiscountAmount] = React.useState(invoice.discount_amount ?? 0)
  const [notes, setNotes] = React.useState(invoice.notes ?? "")
  const [lines, setLines] = React.useState<Line[]>(
    items.map((it) => ({
      key: it.id,
      description: it.description,
      oem_part_number: it.oem_part_number,
      supplier_part_number: it.supplier_part_number,
      quantity: it.quantity,
      unit: it.unit,
      unit_cost: it.unit_cost,
      vat_rate: it.vat_rate,
      inventory_item_id: it.inventory_item_id,
      match_status: it.match_status,
      job_id: it.job_id,
      parts_request_id: it.parts_request_id,
      suggested_job_label: it.suggested_job_label,
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
        oem_part_number: null,
        supplier_part_number: null,
        quantity: 1,
        unit: "pcs",
        unit_cost: 0,
        vat_rate: pricing.vat,
        inventory_item_id: null,
        match_status: "new",
        job_id: null,
        parts_request_id: null,
        suggested_job_label: null,
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
  const total = subtotal - Number(discountAmount || 0) + vat
  const lowConfidence = invoice.ocr_confidence !== null && invoice.ocr_confidence < 0.6

  function toDraftLines(): DraftLine[] {
    return lines.map((l) => ({
      description: l.description,
      oem_part_number: l.oem_part_number,
      supplier_part_number: l.supplier_part_number,
      quantity: Number(l.quantity),
      unit: l.unit,
      unit_cost: Number(l.unit_cost),
      vat_rate: Number(l.vat_rate),
      inventory_item_id: l.inventory_item_id,
      match_status: l.match_status,
      job_id: l.job_id,
      parts_request_id: l.parts_request_id,
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
          discountAmount: Number(discountAmount || 0),
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
    if (!supplierId && !invoice.supplier_name_raw) {
      setErr("Select a supplier before confirming (none was detected on the scan)")
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
          discountAmount: Number(discountAmount || 0),
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
              <Label htmlFor="discount">Discount</Label>
              <Input
                id="discount"
                type="number"
                step="0.01"
                value={discountAmount}
                disabled={readOnly}
                onChange={(e) => setDiscountAmount(Number(e.target.value))}
                className="tabular-nums"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="notes">Notes</Label>
              <Input id="notes" value={notes} disabled={readOnly} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          {!supplierId && invoice.supplier_contact && (
            <div className="mt-4 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
              <p className="font-medium text-sky-100">New supplier detected from scan</p>
              <p className="mt-0.5 text-sky-200/90">
                {[
                  invoice.supplier_name_raw,
                  invoice.supplier_contact.trn && `TRN ${invoice.supplier_contact.trn}`,
                  invoice.supplier_contact.phone,
                  invoice.supplier_contact.email,
                  invoice.supplier_contact.address,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="mt-1 text-sky-300/80">
                Leave the supplier blank to auto-create this profile on confirm, or pick an existing one to merge.
              </p>
            </div>
          )}
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
                jobs={jobs}
                onChange={(patch) => patchLine(l.key, patch)}
                onRemove={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
              />
            ))}
          </div>
        </Card>
      </div>

      {/* Right column: destination map, totals, actions, original file */}
      <div className="space-y-6">
        <DestinationMap
          invoice={invoice}
          supplierId={supplierId}
          suppliers={suppliers}
          lines={lines}
          subtotal={subtotal}
          vat={vat}
          readOnly={readOnly}
        />

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Totals</h2>
          <dl className="space-y-2 text-sm">
            <Row label="Subtotal (excl. VAT)" value={formatCurrency(subtotal)} />
            {Number(discountAmount || 0) > 0 && (
              <Row label="Discount" value={`- ${formatCurrency(Number(discountAmount || 0))}`} />
            )}
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

/**
 * The headline "where every scanned field lands" panel. It reads the current,
 * edited state so the user sees exactly which CRM module each value posts to
 * before pressing Confirm — and flags anything that still needs a human.
 */
function DestinationMap({
  invoice,
  supplierId,
  suppliers,
  lines,
  subtotal,
  vat,
  readOnly,
}: {
  invoice: InvoiceHeader
  supplierId: string
  suppliers: SupplierOpt[]
  lines: Line[]
  subtotal: number
  vat: number
  readOnly: boolean
}) {
  const active = lines.filter((l) => l.match_status !== "ignore")
  const supplierLabel =
    suppliers.find((s) => s.id === supplierId)?.name ||
    (invoice.supplier_name_raw ? `${invoice.supplier_name_raw} (new — will be created)` : null)
  const oemCount = active.filter((l) => (l.oem_part_number ?? "").trim()).length
  const jobLinked = active.filter((l) => l.job_id).length

  const rows: { field: string; dest: string; ok: boolean }[] = [
    { field: supplierLabel ?? "Supplier not set", dest: "Suppliers → Supplier Profile", ok: !!supplierLabel },
    { field: invoice.invoice_number ? `Invoice #${invoice.invoice_number}` : "Invoice # missing", dest: "Purchasing → Supplier Invoice", ok: !!invoice.invoice_number },
    { field: `${active.length} part line${active.length === 1 ? "" : "s"}`, dest: "Parts / Inventory → Stock + Purchase History", ok: active.length > 0 },
    { field: oemCount ? `${oemCount} OEM number${oemCount === 1 ? "" : "s"}` : "No OEM numbers", dest: "Part Master → OEM Number (CRM Part ID stays internal)", ok: true },
    { field: formatCurrency(subtotal), dest: "Finance → Purchase Cost / Payables", ok: true },
    { field: `VAT ${formatCurrency(vat)}`, dest: "Finance → Input VAT", ok: true },
    { field: jobLinked ? `${jobLinked} line${jobLinked === 1 ? "" : "s"} to a job card` : "All to General Stock", dest: "Vehicle / Job Card", ok: true },
  ]

  // Lines the AI could not confidently place.
  const needsReview = active.filter((l) => (l.confidence !== null && l.confidence < 0.6) || !l.description.trim())

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Where this data goes
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        {readOnly ? "Posted automatically on confirm:" : "On confirm, each field posts to:"}
      </p>
      <ul className="space-y-2 text-xs">
        {rows.map((r, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${r.ok ? "bg-emerald-400" : "bg-amber-400"}`} />
            <span className="min-w-0">
              <span className="font-medium text-foreground">{r.field}</span>
              <span className="text-muted-foreground"> → {r.dest}</span>
            </span>
          </li>
        ))}
      </ul>
      {!readOnly && needsReview.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            REVIEW REQUIRED: {needsReview.length} line{needsReview.length === 1 ? "" : "s"} the AI was unsure about — check them before confirming.
          </span>
        </div>
      )}
    </Card>
  )
}

function LineRow({
  line,
  readOnly,
  inventory,
  jobs,
  onChange,
  onRemove,
}: {
  line: Line
  readOnly: boolean
  inventory: InventoryOpt[]
  jobs: JobOpt[]
  onChange: (patch: Partial<Line>) => void
  onRemove: () => void
}) {
  const margin = marginPct(line.unit_cost, line.suggested_sale_price)
  const partInputClass =
    "h-8 w-full rounded-md border border-input bg-background/60 px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-100"

  const linkedItem = line.inventory_item_id ? inventory.find((i) => i.id === line.inventory_item_id) : undefined

  // OEM-first suggestions, only for lines not yet linked to a part. An exact OEM
  // match is a strong suggestion; a supplier-number-only match is a "possible
  // match" that a human must confirm. Descriptions are never matched on.
  const oemKey = normPN(line.oem_part_number)
  const supKey = normPN(line.supplier_part_number)
  const oemMatches =
    line.match_status === "new" && oemKey ? inventory.filter((i) => normPN(i.oem_part_number) === oemKey) : []
  const supMatches =
    line.match_status === "new" && !oemMatches.length && supKey
      ? inventory.filter((i) => normPN(i.supplier_part_number) === supKey)
      : []

  function linkTo(item: InventoryOpt) {
    onChange({
      match_status: "matched",
      inventory_item_id: item.id,
      // Fill any blank identifiers from the matched part, but never clobber what
      // the invoice actually shows.
      ...(!line.oem_part_number && item.oem_part_number ? { oem_part_number: item.oem_part_number } : {}),
    })
  }

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
          <div className="mt-1 grid grid-cols-2 gap-1">
            <input
              value={line.oem_part_number ?? ""}
              disabled={readOnly}
              placeholder="OEM part #"
              aria-label="OEM part number"
              onChange={(e) => onChange({ oem_part_number: e.target.value || null })}
              className={`${partInputClass} font-mono text-foreground`}
            />
            <input
              value={line.supplier_part_number ?? ""}
              disabled={readOnly}
              placeholder="Supplier part #"
              aria-label="Supplier part number"
              onChange={(e) => onChange({ supplier_part_number: e.target.value || null })}
              className={`${partInputClass} text-muted-foreground`}
            />
          </div>
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

      {/* OEM / possible-match guidance */}
      {!readOnly && oemMatches.length === 1 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
          <span>
            OEM match: <span className="font-medium">{oemMatches[0].name}</span>
            {oemMatches[0].crm_part_id ? ` · ${oemMatches[0].crm_part_id}` : ""} — adds this purchase to the existing part.
          </span>
          <Button size="sm" variant="outline" className="h-6 px-2" onClick={() => linkTo(oemMatches[0])}>
            Link
          </Button>
        </div>
      )}
      {!readOnly && oemMatches.length > 1 && (
        <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
          POSSIBLE MATCH — REVIEW REQUIRED: {oemMatches.length} parts share this OEM number. Pick the correct one below.
        </div>
      )}
      {!readOnly && supMatches.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
          <span>
            POSSIBLE MATCH — REVIEW REQUIRED: supplier part # matches{" "}
            <span className="font-medium">{supMatches[0].name}</span>
            {supMatches[0].crm_part_id ? ` · ${supMatches[0].crm_part_id}` : ""}. Confirm the OEM number before linking.
          </span>
          <Button size="sm" variant="outline" className="h-6 px-2" onClick={() => linkTo(supMatches[0])}>
            Link anyway
          </Button>
        </div>
      )}

      {/* Match + pricing controls */}
      <div className="mt-2 grid grid-cols-12 items-end gap-2">
        <div className="col-span-12 sm:col-span-5">
          <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
            Inventory
            {linkedItem?.crm_part_id ? (
              <span className="ml-1 font-mono text-primary">· {linkedItem.crm_part_id}</span>
            ) : null}
          </span>
          <Select
            value={line.match_status === "ignore" ? "__ignore" : line.inventory_item_id ?? "__new"}
            disabled={readOnly}
            onChange={(e) => {
              const v = e.target.value
              if (v === "__ignore") onChange({ match_status: "ignore" })
              else if (v === "__new") onChange({ match_status: "new", inventory_item_id: null })
              else {
                const item = inventory.find((i) => i.id === v)
                if (item) linkTo(item)
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
                  {i.oem_part_number ? ` · OEM ${i.oem_part_number}` : ""}
                  {i.crm_part_id ? ` · ${i.crm_part_id}` : ""}
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

      {/* Related to: General Stock or a specific Job Card / Vehicle */}
      {line.match_status !== "ignore" && (
        <div className="mt-2 flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Related to</span>
            <Select
              value={line.job_id ?? "__stock"}
              disabled={readOnly}
              onChange={(e) => onChange({ job_id: e.target.value === "__stock" ? null : e.target.value })}
              className="h-8 w-auto min-w-[220px] text-xs"
            >
              <option value="__stock">General Stock</option>
              <optgroup label="Job Card / Vehicle">
                {jobs.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.label}
                  </option>
                ))}
              </optgroup>
            </Select>
          </div>
          {!readOnly && line.parts_request_id && line.job_id && (
            <span className="text-[10px] text-emerald-300">
              Suggested from an existing parts request{line.suggested_job_label ? ` · ${line.suggested_job_label}` : ""} — confirming updates the job card.
            </span>
          )}
        </div>
      )}
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
  const onAccount = invoice.payment_status === "credit"

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Payments</h2>
        {!paid && (
          <button
            type="button"
            disabled={pending}
            onClick={() => start(async () => { await setSupplierInvoiceOnAccount(invoice.id, !onAccount) })}
            className="text-xs text-sky-300 hover:underline disabled:opacity-50"
          >
            {onAccount ? "Clear on-account" : "Mark on account (credit)"}
          </button>
        )}
      </div>
      {onAccount && (
        <p className="mb-3 rounded-lg bg-sky-500/10 px-3 py-2 text-center text-xs text-sky-300">
          On account — outstanding on supplier credit terms.
        </p>
      )}
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
    credit: "border-sky-500/30 bg-sky-500/15 text-sky-300",
  }
  const label = status === "credit" ? "on account" : status
  return <Badge className={map[status] ?? map.unpaid}>{label}</Badge>
}

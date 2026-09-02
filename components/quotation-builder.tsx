"use client"

import * as React from "react"
import { saveQuotation, type QuoteItemInput } from "@/lib/actions"
import { Button, Card, Input, AutoTextarea, Label } from "@/components/ui"
import { VAT_RATE } from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import { Plus, Trash2, Save, Pencil, Printer, FileText, X, Lock, Wrench, Package, Tag } from "lucide-react"

export type Recommendation = "required" | "recommended" | "optional"

export type Item = {
  kind: "part" | "labor"
  name: string
  part_number: string
  detail: string
  quantity: number
  unit_price: number
  labour_hours: number
  labour_rate: number
  discount: number
  category: string
  recommendation: Recommendation
}

export const RECOMMENDATIONS: { value: Recommendation; label: string; chip: string }[] = [
  { value: "required", label: "Required", chip: "border-red-500/30 bg-red-500/10 text-red-300" },
  { value: "recommended", label: "Recommended", chip: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  { value: "optional", label: "Optional", chip: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
]

export const CATEGORY_SUGGESTIONS = [
  "Engine",
  "Brakes",
  "Suspension & Steering",
  "Electrical",
  "Air Conditioning",
  "Transmission",
  "Tyres & Wheels",
  "Body & Paint",
  "Diagnostics",
  "General Service",
]

function recMeta(r: Recommendation) {
  return RECOMMENDATIONS.find((x) => x.value === r) ?? RECOMMENDATIONS[0]
}

function emptyItem(kind: Item["kind"]): Item {
  return {
    kind,
    name: "",
    part_number: "",
    detail: "",
    quantity: 1,
    unit_price: 0,
    labour_hours: 0,
    labour_rate: 0,
    discount: 0,
    category: "",
    recommendation: "required",
  }
}

function lineGross(i: Item) {
  if (i.kind === "labor") {
    const hours = Number(i.labour_hours) || 0
    const rate = Number(i.labour_rate) || 0
    return hours > 0 ? hours * rate : rate
  }
  return (Number(i.quantity) || 0) * (Number(i.unit_price) || 0)
}

function lineBase(i: Item) {
  return Math.max(0, lineGross(i) - (Number(i.discount) || 0))
}

// VAT-exclusive: base is the taxable net, VAT added on top.
// VAT-inclusive: base already contains VAT, so back-calculate the net + VAT portion.
function lineParts(i: Item, vat: number, inclusive: boolean) {
  const base = lineBase(i)
  if (inclusive) {
    const net = base / (1 + vat / 100)
    return { net, vat: base - net, total: base }
  }
  const v = (base * vat) / 100
  return { net: base, vat: v, total: base + v }
}

function totals(items: Item[], vat: number, inclusive = false) {
  const discountTotal = items.reduce((s, i) => s + (Number(i.discount) || 0), 0)
  let partsTotal = 0
  let laborTotal = 0
  let vatAmount = 0
  for (const i of items) {
    const { net, vat: v } = lineParts(i, vat, inclusive)
    if (i.kind === "part") partsTotal += net
    else laborTotal += net
    vatAmount += v
  }
  const subtotal = partsTotal + laborTotal
  const total = subtotal + vatAmount
  return { partsTotal, laborTotal, discountTotal, subtotal, vatAmount, total }
}

export function QuotationBuilder({
  jobId,
  initialItems,
  initialVat,
  initialVatInclusive = false,
  initialDescription,
  initialInternalNotes,
  hasQuotation,
  printHref,
  locked,
}: {
  jobId: string
  initialItems: Item[]
  initialVat: number
  initialVatInclusive?: boolean
  initialDescription: string
  initialInternalNotes: string
  hasQuotation: boolean
  printHref: string
  locked: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const vat = initialVat || VAT_RATE
  const inclusive = initialVatInclusive

  const parts = initialItems.filter((i) => i.kind === "part")
  const labour = initialItems.filter((i) => i.kind === "labor")
  const t = totals(initialItems, vat, inclusive)

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Quotation</h2>
        <div className="flex items-center gap-2">
          {locked && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-300">
              <Lock className="h-3 w-3" /> Approved — locked
            </span>
          )}
          {hasQuotation && (
            <a href={printHref} target="_blank" rel="noopener noreferrer">
              <Button type="button" variant="outline" size="sm">
                <Printer className="h-3.5 w-3.5" /> Print / PDF
              </Button>
            </a>
          )}
          {!locked && (
            <Button type="button" size="sm" onClick={() => setOpen(true)}>
              <Pencil className="h-3.5 w-3.5" /> {hasQuotation ? "Edit quotation" : "Create quotation"}
            </Button>
          )}
        </div>
      </div>

      {!hasQuotation ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-10 text-center">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No quotation created yet.</p>
          {!locked && (
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Build quotation
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {initialDescription && (
            <div className="rounded-lg border border-border bg-background/40 p-4">
              <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Work description
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{initialDescription}</p>
            </div>
          )}

          {parts.length > 0 && (
            <SummarySection icon={<Package className="h-4 w-4" />} title="Parts">
              {parts.map((it, idx) => (
                <SummaryLine key={idx} it={it} vat={vat} inclusive={inclusive} />
              ))}
            </SummarySection>
          )}

          {labour.length > 0 && (
            <SummarySection icon={<Wrench className="h-4 w-4" />} title="Labour / Services">
              {labour.map((it, idx) => (
                <SummaryLine key={idx} it={it} vat={vat} inclusive={inclusive} />
              ))}
            </SummarySection>
          )}

          <div className="space-y-1.5 border-t border-border pt-4 text-sm">
            <SummaryRow label="Parts subtotal" value={formatCurrency(t.partsTotal)} />
            <SummaryRow label="Labour subtotal" value={formatCurrency(t.laborTotal)} />
            {t.discountTotal > 0 && <SummaryRow label="Discount applied" value={`− ${formatCurrency(t.discountTotal)}`} />}
            <SummaryRow label="Subtotal (excl. VAT)" value={formatCurrency(t.subtotal)} />
            <SummaryRow
              label={`VAT (${vat}%)${inclusive ? " — included" : ""}`}
              value={formatCurrency(t.vatAmount)}
            />
            <div className="flex items-center justify-between border-t border-border pt-2 text-base font-bold">
              <span>Grand total</span>
              <span className="tabular-nums text-primary">{formatCurrency(t.total)}</span>
            </div>
            <p className="pt-1 text-[11px] text-muted-foreground">
              Prices are VAT-{inclusive ? "inclusive" : "exclusive"}.
            </p>
          </div>

          {initialInternalNotes && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="mb-1.5 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-amber-400">
                <Lock className="h-3 w-3" /> Internal workshop notes — not shown to customer
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{initialInternalNotes}</p>
            </div>
          )}
        </div>
      )}

      {open && (
        <QuotationEditor
          jobId={jobId}
          initialItems={initialItems}
          initialVat={vat}
          initialVatInclusive={inclusive}
          initialDescription={initialDescription}
          initialInternalNotes={initialInternalNotes}
          onClose={() => setOpen(false)}
        />
      )}
    </Card>
  )
}

function SummarySection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon} {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function SummaryLine({ it, vat, inclusive }: { it: Item; vat: number; inclusive: boolean }) {
  const { vat: lineVat, total } = lineParts(it, vat, inclusive)
  const rec = recMeta(it.recommendation)
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{it.name || "Untitled item"}</span>
            {it.part_number && (
              <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
                #{it.part_number}
              </span>
            )}
            {it.recommendation !== "required" && (
              <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${rec.chip}`}>
                {rec.label}
              </span>
            )}
          </div>
          {it.detail && (
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{it.detail}</p>
          )}
        </div>
        <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(total)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {it.kind === "part" ? (
          <>
            <span>Qty {it.quantity}</span>
            <span>Unit {formatCurrency(it.unit_price)}</span>
          </>
        ) : (
          <>
            {it.labour_hours > 0 && <span>{it.labour_hours} hrs</span>}
            <span>Rate {formatCurrency(it.labour_rate)}</span>
          </>
        )}
        {it.discount > 0 && <span className="text-amber-400">− {formatCurrency(it.discount)}</span>}
        <span>VAT {formatCurrency(lineVat)}{inclusive ? " (incl.)" : ""}</span>
      </div>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums text-foreground">{value}</span>
    </div>
  )
}

/* ---------------- Full-screen editor ---------------- */
function QuotationEditor({
  jobId,
  initialItems,
  initialVat,
  initialVatInclusive,
  initialDescription,
  initialInternalNotes,
  onClose,
}: {
  jobId: string
  initialItems: Item[]
  initialVat: number
  initialVatInclusive: boolean
  initialDescription: string
  initialInternalNotes: string
  onClose: () => void
}) {
  const [description, setDescription] = React.useState(initialDescription)
  const [internalNotes, setInternalNotes] = React.useState(initialInternalNotes)
  const [vat, setVat] = React.useState(initialVat)
  const [inclusive, setInclusive] = React.useState(initialVatInclusive)
  const [items, setItems] = React.useState<Item[]>(
    initialItems.length ? initialItems : [emptyItem("part"), emptyItem("labor")],
  )
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [onClose])

  const t = totals(items, vat, inclusive)

  function update(id: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === id ? { ...it, ...patch } : it)))
  }
  function add(kind: Item["kind"]) {
    setItems((prev) => [...prev, emptyItem(kind)])
  }
  function remove(id: number) {
    setItems((prev) => prev.filter((_, i) => i !== id))
  }

  async function save() {
    setSaving(true)
    try {
      await saveQuotation(jobId, {
        description,
        internalNotes,
        vatRate: vat,
        vatInclusive: inclusive,
        items: items
          .filter((i) => i.name.trim() || i.detail.trim() || lineGross(i) > 0)
          .map<QuoteItemInput>((i) => ({
            kind: i.kind,
            name: i.name,
            part_number: i.part_number,
            detail: i.detail,
            quantity: Number(i.quantity) || 0,
            unit_price: Number(i.unit_price) || 0,
            labour_hours: Number(i.labour_hours) || 0,
            labour_rate: Number(i.labour_rate) || 0,
            discount: Number(i.discount) || 0,
            category: i.category?.trim() || undefined,
            recommendation: i.recommendation,
          })),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  // Keep stable indices for update/remove while rendering grouped sections
  const indexed = items.map((it, index) => ({ it, index }))
  const partRows = indexed.filter((r) => r.it.kind === "part")
  const labourRows = indexed.filter((r) => r.it.kind === "labor")

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Quotation editor</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save quotation"}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
            aria-label="Close editor"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Customer work description */}
            <section>
              <Label>Work description (visible to customer)</Label>
              <AutoTextarea
                minRows={6}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the overall diagnosis, scope of work and what the customer is approving. This appears at the top of the customer quotation."
              />
            </section>

            {/* PARTS */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <Label className="mb-0 flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" /> Parts
                </Label>
                <span className="text-xs text-muted-foreground">{partRows.length} part(s)</span>
              </div>
              <div className="space-y-4">
                {partRows.map(({ it, index }) => (
                  <PartRow
                    key={index}
                    it={it}
                    vat={vat}
                    inclusive={inclusive}
                    onChange={(patch) => update(index, patch)}
                    onRemove={() => remove(index)}
                  />
                ))}
                {partRows.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
                    No parts added.
                  </p>
                )}
              </div>
              <div className="mt-3">
                <Button type="button" variant="outline" size="sm" onClick={() => add("part")}>
                  <Plus className="h-3.5 w-3.5" /> Add part
                </Button>
              </div>
            </section>

            {/* LABOUR */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <Label className="mb-0 flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5" /> Labour / Services
                </Label>
                <span className="text-xs text-muted-foreground">{labourRows.length} item(s)</span>
              </div>
              <div className="space-y-4">
                {labourRows.map(({ it, index }) => (
                  <LabourRow
                    key={index}
                    it={it}
                    vat={vat}
                    inclusive={inclusive}
                    onChange={(patch) => update(index, patch)}
                    onRemove={() => remove(index)}
                  />
                ))}
                {labourRows.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-muted-foreground">
                    No labour lines added.
                  </p>
                )}
              </div>
              <div className="mt-3">
                <Button type="button" variant="outline" size="sm" onClick={() => add("labor")}>
                  <Plus className="h-3.5 w-3.5" /> Add labour / service
                </Button>
              </div>
            </section>

            {/* Internal notes */}
            <section>
              <Label className="flex items-center gap-1.5 text-amber-400">
                <Lock className="h-3 w-3" /> Internal workshop notes (NOT visible to customer)
              </Label>
              <AutoTextarea
                minRows={5}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Private notes for the workshop team: technician findings, supplier details, internal warnings. Customers never see this."
                className="border-amber-500/30 bg-amber-500/5"
              />
            </section>
          </div>

          {/* Totals sidebar */}
          <aside className="lg:col-span-1">
            <div className="sticky top-0 space-y-4 rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Summary</h3>

              {/* VAT mode toggle */}
              <div className="rounded-lg border border-border bg-background/50 p-1">
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => setInclusive(false)}
                    className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                      !inclusive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    VAT exclusive
                  </button>
                  <button
                    type="button"
                    onClick={() => setInclusive(true)}
                    className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                      inclusive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    VAT inclusive
                  </button>
                </div>
                <p className="px-1 pb-0.5 pt-1.5 text-[10px] leading-snug text-muted-foreground">
                  {inclusive
                    ? "Entered prices already include VAT. VAT is calculated out of the total."
                    : "Entered prices are before VAT. VAT is added on top."}
                </p>
              </div>

              <div className="space-y-1.5 text-sm">
                <SummaryRow label="Parts subtotal" value={formatCurrency(t.partsTotal)} />
                <SummaryRow label="Labour subtotal" value={formatCurrency(t.laborTotal)} />
                {t.discountTotal > 0 && <SummaryRow label="Discount applied" value={`− ${formatCurrency(t.discountTotal)}`} />}
                <SummaryRow label="Subtotal (excl. VAT)" value={formatCurrency(t.subtotal)} />
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>VAT</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={vat}
                    onChange={(e) => setVat(Number(e.target.value))}
                    className="h-8 w-16 text-right"
                  />
                  <span>%</span>
                </div>
                <span className="tabular-nums">{formatCurrency(t.vatAmount)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3 text-lg font-bold">
                <span>Grand total</span>
                <span className="tabular-nums text-primary">{formatCurrency(t.total)}</span>
              </div>
              <Button type="button" className="w-full" onClick={save} disabled={saving}>
                <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save quotation"}
              </Button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

/* ---------------- Part row ---------------- */
function PartRow({
  it,
  vat,
  inclusive,
  onChange,
  onRemove,
}: {
  it: Item
  vat: number
  inclusive: boolean
  onChange: (patch: Partial<Item>) => void
  onRemove: () => void
}) {
  const { vat: lineVat, total } = lineParts(it, vat, inclusive)
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Input
          value={it.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Part name"
          className="h-9 flex-1"
        />
        <button
          type="button"
          onClick={onRemove}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-red-400"
          aria-label="Remove part"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <CategoryRecoRow it={it} onChange={onChange} />

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Part number</Label>
          <Input
            value={it.part_number}
            onChange={(e) => onChange({ part_number: e.target.value })}
            placeholder="e.g. 04465-60320"
            className="h-9 font-mono"
          />
        </div>
      </div>

      <div className="mb-3">
        <Label>Description</Label>
        <AutoTextarea
          minRows={3}
          value={it.detail}
          onChange={(e) => onChange({ detail: e.target.value })}
          placeholder="Part specification, brand, fitment notes, warranty…"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <NumField label="Quantity" value={it.quantity} step="1" onChange={(v) => onChange({ quantity: v })} />
        <NumField
          label={`Unit price${inclusive ? " (incl.)" : ""}`}
          value={it.unit_price}
          step="0.01"
          onChange={(v) => onChange({ unit_price: v })}
        />
        <NumField label="Discount" value={it.discount} step="0.01" onChange={(v) => onChange({ discount: v })} />
      </div>

      <LineFooter vat={vat} lineVat={lineVat} total={total} inclusive={inclusive} />
    </div>
  )
}

/* ---------------- Labour row ---------------- */
function LabourRow({
  it,
  vat,
  inclusive,
  onChange,
  onRemove,
}: {
  it: Item
  vat: number
  inclusive: boolean
  onChange: (patch: Partial<Item>) => void
  onRemove: () => void
}) {
  const { vat: lineVat, total } = lineParts(it, vat, inclusive)
  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Input
          value={it.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Labour / service name"
          className="h-9 flex-1"
        />
        <button
          type="button"
          onClick={onRemove}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-red-400"
          aria-label="Remove labour line"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <CategoryRecoRow it={it} onChange={onChange} />

      <div className="mb-3">
        <Label>Detailed work description</Label>
        <AutoTextarea
          minRows={4}
          value={it.detail}
          onChange={(e) => onChange({ detail: e.target.value })}
          placeholder="Diagnosis, repair procedure, labour steps, warranty notes…"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <NumField
          label="Labour hours"
          value={it.labour_hours}
          step="0.5"
          onChange={(v) => onChange({ labour_hours: v })}
        />
        <NumField
          label={`Labour rate${inclusive ? " (incl.)" : ""}`}
          value={it.labour_rate}
          step="0.01"
          onChange={(v) => onChange({ labour_rate: v })}
        />
        <NumField label="Discount" value={it.discount} step="0.01" onChange={(v) => onChange({ discount: v })} />
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        If hours are set, the line = hours × rate. Leave hours at 0 to use the rate as a flat labour charge.
      </p>

      <LineFooter vat={vat} lineVat={lineVat} total={total} inclusive={inclusive} />
    </div>
  )
}

function CategoryRecoRow({ it, onChange }: { it: Item; onChange: (patch: Partial<Item>) => void }) {
  const listId = React.useId()
  return (
    <div className="mb-3 grid gap-3 sm:grid-cols-2">
      <div>
        <Label className="flex items-center gap-1.5">
          <Tag className="h-3 w-3" /> Category
        </Label>
        <Input
          value={it.category}
          onChange={(e) => onChange({ category: e.target.value })}
          placeholder="e.g. Brakes"
          list={listId}
          className="h-9"
        />
        <datalist id={listId}>
          {CATEGORY_SUGGESTIONS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div>
        <Label>Recommendation</Label>
        <div className="flex gap-1">
          {RECOMMENDATIONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => onChange({ recommendation: r.value })}
              className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                it.recommendation === r.value
                  ? r.chip
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function LineFooter({
  vat,
  lineVat,
  total,
  inclusive,
}: {
  vat: number
  lineVat: number
  total: number
  inclusive: boolean
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
      <span className="text-muted-foreground">
        VAT ({vat}%){inclusive ? " incl." : ""}:{" "}
        <span className="tabular-nums text-foreground">{formatCurrency(lineVat)}</span>
      </span>
      <span className="font-semibold">
        Line total: <span className="tabular-nums text-primary">{formatCurrency(total)}</span>
      </span>
    </div>
  )
}

function NumField({
  label,
  value,
  step,
  onChange,
}: {
  label: string
  value: number
  step: string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 text-right"
      />
    </div>
  )
}

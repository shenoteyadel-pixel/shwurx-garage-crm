"use client"

import * as React from "react"
import { saveQuotation, type QuoteItemInput } from "@/lib/actions"
import { Button, Card, Input, Select, AutoTextarea, Label } from "@/components/ui"
import { VAT_RATE } from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import { Plus, Trash2, Save, Pencil, Printer, FileText, X, Lock } from "lucide-react"

type Item = {
  kind: "part" | "labor" | "service"
  name: string
  detail: string
  quantity: number
  unit_price: number
  labor: number
  discount: number
}

const KIND_LABEL: Record<Item["kind"], string> = { part: "Part", labor: "Labor", service: "Service" }

function emptyItem(kind: Item["kind"] = "part"): Item {
  return { kind, name: "", detail: "", quantity: 1, unit_price: 0, labor: 0, discount: 0 }
}

function lineBase(i: Item) {
  return Math.max(0, (Number(i.quantity) || 0) * (Number(i.unit_price) || 0) + (Number(i.labor) || 0) - (Number(i.discount) || 0))
}

export function QuotationBuilder({
  jobId,
  initialItems,
  initialVat,
  initialDescription,
  initialInternalNotes,
  hasQuotation,
  printHref,
  locked,
}: {
  jobId: string
  initialItems: Item[]
  initialVat: number
  initialDescription: string
  initialInternalNotes: string
  hasQuotation: boolean
  printHref: string
  locked: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const vat = initialVat || VAT_RATE

  const partsTotal = initialItems.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const laborTotal = initialItems.reduce((s, i) => s + i.labor, 0)
  const discountTotal = initialItems.reduce((s, i) => s + i.discount, 0)
  const subtotal = partsTotal + laborTotal - discountTotal
  const vatAmount = (subtotal * vat) / 100
  const total = subtotal + vatAmount

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

          <div className="space-y-2">
            {initialItems.map((it, idx) => {
              const base = lineBase(it)
              const lineVat = (base * vat) / 100
              return (
                <div key={idx} className="rounded-lg border border-border bg-background/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {KIND_LABEL[it.kind]}
                        </span>
                        <span className="font-medium">{it.name || "Untitled item"}</span>
                      </div>
                      {it.detail && (
                        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                          {it.detail}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(base + lineVat)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Qty {it.quantity}</span>
                    <span>Unit {formatCurrency(it.unit_price)}</span>
                    {it.labor > 0 && <span>Labor {formatCurrency(it.labor)}</span>}
                    {it.discount > 0 && <span className="text-amber-400">− {formatCurrency(it.discount)}</span>}
                    <span>VAT {formatCurrency(lineVat)}</span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="space-y-1.5 border-t border-border pt-4 text-sm">
            <SummaryRow label="Parts" value={formatCurrency(partsTotal)} />
            <SummaryRow label="Labor" value={formatCurrency(laborTotal)} />
            {discountTotal > 0 && <SummaryRow label="Discount" value={`− ${formatCurrency(discountTotal)}`} />}
            <SummaryRow label="Subtotal" value={formatCurrency(subtotal)} />
            <SummaryRow label={`VAT (${vat}%)`} value={formatCurrency(vatAmount)} />
            <div className="flex items-center justify-between border-t border-border pt-2 text-base font-bold">
              <span>Total</span>
              <span className="tabular-nums text-primary">{formatCurrency(total)}</span>
            </div>
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
          initialDescription={initialDescription}
          initialInternalNotes={initialInternalNotes}
          onClose={() => setOpen(false)}
        />
      )}
    </Card>
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
  initialDescription,
  initialInternalNotes,
  onClose,
}: {
  jobId: string
  initialItems: Item[]
  initialVat: number
  initialDescription: string
  initialInternalNotes: string
  onClose: () => void
}) {
  const [description, setDescription] = React.useState(initialDescription)
  const [internalNotes, setInternalNotes] = React.useState(initialInternalNotes)
  const [vat, setVat] = React.useState(initialVat)
  const [items, setItems] = React.useState<Item[]>(initialItems.length ? initialItems : [emptyItem()])
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

  const partsTotal = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0)
  const laborTotal = items.reduce((s, i) => s + (Number(i.labor) || 0), 0)
  const discountTotal = items.reduce((s, i) => s + (Number(i.discount) || 0), 0)
  const subtotal = partsTotal + laborTotal - discountTotal
  const vatAmount = (subtotal * vat) / 100
  const total = subtotal + vatAmount

  function update(idx: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }
  function add(kind: Item["kind"]) {
    setItems((prev) => [...prev, emptyItem(kind)])
  }
  function remove(idx: number) {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)))
  }

  async function save() {
    setSaving(true)
    try {
      await saveQuotation(jobId, {
        description,
        internalNotes,
        vatRate: vat,
        items: items
          .filter((i) => i.name.trim() || i.detail.trim() || i.unit_price > 0 || i.labor > 0)
          .map<QuoteItemInput>((i) => ({
            kind: i.kind,
            name: i.name,
            detail: i.detail,
            quantity: Number(i.quantity) || 0,
            unit_price: Number(i.unit_price) || 0,
            labor: Number(i.labor) || 0,
            discount: Number(i.discount) || 0,
          })),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

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
        <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-3">
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

            {/* Line items */}
            <section>
              <div className="mb-2 flex items-center justify-between">
                <Label className="mb-0">Line items</Label>
                <span className="text-xs text-muted-foreground">{items.length} item(s)</span>
              </div>
              <div className="space-y-4">
                {items.map((it, idx) => {
                  const base = lineBase(it)
                  const lineVat = (base * vat) / 100
                  return (
                    <div key={idx} className="rounded-xl border border-border bg-card/60 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <Select
                          value={it.kind}
                          onChange={(e) => update(idx, { kind: e.target.value as Item["kind"] })}
                          className="h-9 w-32"
                        >
                          <option value="part">Part</option>
                          <option value="service">Service</option>
                          <option value="labor">Labor</option>
                        </Select>
                        <Input
                          value={it.name}
                          onChange={(e) => update(idx, { name: e.target.value })}
                          placeholder="Part / service name"
                          className="h-9 flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => remove(idx)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-red-400"
                          aria-label="Remove line item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="mb-3">
                        <Label>Detailed description</Label>
                        <AutoTextarea
                          minRows={4}
                          value={it.detail}
                          onChange={(e) => update(idx, { detail: e.target.value })}
                          placeholder="Diagnosis, repair procedure, parts required, customer notes, warranty notes…"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <NumField
                          label="Quantity"
                          value={it.quantity}
                          step="0.5"
                          onChange={(v) => update(idx, { quantity: v })}
                        />
                        <NumField
                          label="Unit price"
                          value={it.unit_price}
                          step="0.01"
                          onChange={(v) => update(idx, { unit_price: v })}
                        />
                        <NumField
                          label="Labor"
                          value={it.labor}
                          step="0.01"
                          onChange={(v) => update(idx, { labor: v })}
                        />
                        <NumField
                          label="Discount"
                          value={it.discount}
                          step="0.01"
                          onChange={(v) => update(idx, { discount: v })}
                        />
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
                        <span className="text-muted-foreground">
                          VAT ({vat}%): <span className="tabular-nums text-foreground">{formatCurrency(lineVat)}</span>
                        </span>
                        <span className="font-semibold">
                          Line total:{" "}
                          <span className="tabular-nums text-primary">{formatCurrency(base + lineVat)}</span>
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => add("part")}>
                  <Plus className="h-3.5 w-3.5" /> Part
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => add("service")}>
                  <Plus className="h-3.5 w-3.5" /> Service
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => add("labor")}>
                  <Plus className="h-3.5 w-3.5" /> Labor
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
              <div className="space-y-1.5 text-sm">
                <SummaryRow label="Parts" value={formatCurrency(partsTotal)} />
                <SummaryRow label="Labor" value={formatCurrency(laborTotal)} />
                {discountTotal > 0 && <SummaryRow label="Discount" value={`− ${formatCurrency(discountTotal)}`} />}
                <SummaryRow label="Subtotal" value={formatCurrency(subtotal)} />
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
                <span className="tabular-nums">{formatCurrency(vatAmount)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-3 text-lg font-bold">
                <span>Total</span>
                <span className="tabular-nums text-primary">{formatCurrency(total)}</span>
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

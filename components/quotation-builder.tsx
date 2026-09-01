"use client"

import * as React from "react"
import { saveQuotation } from "@/lib/actions"
import { Button, Card, Input, Select } from "@/components/ui"
import { VAT_RATE } from "@/lib/constants"
import { formatCurrency } from "@/lib/utils"
import { Plus, Trash2, Save } from "lucide-react"

type Item = { kind: "part" | "labor"; description: string; quantity: number; unit_price: number }

export function QuotationBuilder({
  jobId,
  initialItems,
  initialVat,
  locked,
}: {
  jobId: string
  initialItems: Item[]
  initialVat: number
  locked: boolean
}) {
  const [items, setItems] = React.useState<Item[]>(
    initialItems.length ? initialItems : [{ kind: "part", description: "", quantity: 1, unit_price: 0 }],
  )
  const [vat, setVat] = React.useState(initialVat || VAT_RATE)
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)

  const partsTotal = items.filter((i) => i.kind === "part").reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const laborTotal = items.filter((i) => i.kind === "labor").reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const subtotal = partsTotal + laborTotal
  const vatAmount = (subtotal * vat) / 100
  const total = subtotal + vatAmount

  function update(idx: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
    setSaved(false)
  }
  function add(kind: "part" | "labor") {
    setItems((prev) => [...prev, { kind, description: "", quantity: 1, unit_price: 0 }])
    setSaved(false)
  }
  function remove(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    try {
      await saveQuotation(
        jobId,
        items.filter((i) => i.description.trim()),
        vat,
      )
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Quotation</h2>
        {locked && (
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs text-emerald-300">
            Approved — locked
          </span>
        )}
      </div>

      <div className="space-y-2">
        <div className="hidden grid-cols-[100px_1fr_70px_110px_110px_36px] gap-2 px-1 text-[11px] uppercase tracking-wide text-muted-foreground sm:grid">
          <span>Type</span>
          <span>Description</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Unit</span>
          <span className="text-right">Total</span>
          <span />
        </div>
        {items.map((it, idx) => (
          <div key={idx} className="grid grid-cols-2 gap-2 sm:grid-cols-[100px_1fr_70px_110px_110px_36px]">
            <Select
              value={it.kind}
              disabled={locked}
              onChange={(e) => update(idx, { kind: e.target.value as "part" | "labor" })}
              className="h-9"
            >
              <option value="part">Part</option>
              <option value="labor">Labor</option>
            </Select>
            <Input
              value={it.description}
              disabled={locked}
              onChange={(e) => update(idx, { description: e.target.value })}
              placeholder="Description"
              className="col-span-2 h-9 sm:col-span-1"
            />
            <Input
              type="number"
              min="0"
              step="0.5"
              value={it.quantity}
              disabled={locked}
              onChange={(e) => update(idx, { quantity: Number(e.target.value) })}
              className="h-9 text-right"
            />
            <Input
              type="number"
              min="0"
              step="0.01"
              value={it.unit_price}
              disabled={locked}
              onChange={(e) => update(idx, { unit_price: Number(e.target.value) })}
              className="h-9 text-right"
            />
            <div className="flex h-9 items-center justify-end px-1 text-sm font-medium tabular-nums">
              {formatCurrency(it.quantity * it.unit_price)}
            </div>
            <button
              type="button"
              disabled={locked}
              onClick={() => remove(idx)}
              className="flex h-9 items-center justify-center text-muted-foreground hover:text-red-400 disabled:opacity-40"
              aria-label="Remove line"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {!locked && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => add("part")}>
            <Plus className="h-3.5 w-3.5" /> Part
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => add("labor")}>
            <Plus className="h-3.5 w-3.5" /> Labor
          </Button>
        </div>
      )}

      <div className="mt-5 space-y-1.5 border-t border-border pt-4 text-sm">
        <Row label="Parts" value={formatCurrency(partsTotal)} />
        <Row label="Labor" value={formatCurrency(laborTotal)} />
        <Row label="Subtotal" value={formatCurrency(subtotal)} />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>VAT</span>
            <Input
              type="number"
              min="0"
              step="0.5"
              value={vat}
              disabled={locked}
              onChange={(e) => {
                setVat(Number(e.target.value))
                setSaved(false)
              }}
              className="h-7 w-16 text-right"
            />
            <span>%</span>
          </div>
          <span className="tabular-nums">{formatCurrency(vatAmount)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2 text-base font-bold">
          <span>Total</span>
          <span className="tabular-nums text-primary">{formatCurrency(total)}</span>
        </div>
      </div>

      {!locked && (
        <div className="mt-4 flex items-center justify-end gap-3">
          {saved && <span className="text-xs text-emerald-400">Saved</span>}
          <Button type="button" onClick={save} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? "Saving..." : "Save Quotation"}
          </Button>
        </div>
      )}
    </Card>
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

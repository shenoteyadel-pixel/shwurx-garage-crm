"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, Button, Input, Label, Select, Textarea } from "@/components/ui"
import { createPurchaseOrder } from "@/lib/actions-crm"
import { formatCurrency } from "@/lib/utils"
import { VAT_RATE } from "@/lib/constants"
import { Plus, Trash2 } from "lucide-react"

type Supplier = { id: string; name: string }
type Item = { id: string; name: string; cost_price: number; unit: string }
type Job = { id: string; job_number: string; customer_name: string }
type Line = { key: string; description: string; item_id: string; quantity: number; unit_cost: number }

let counter = 0
const newLine = (): Line => ({ key: `l${counter++}`, description: "", item_id: "", quantity: 1, unit_cost: 0 })

export function PurchaseOrderForm({
  suppliers,
  items,
  jobs,
  defaultSupplier,
  defaultJob,
}: {
  suppliers: Supplier[]
  items: Item[]
  jobs: Job[]
  defaultSupplier: string | null
  defaultJob: string | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [supplierId, setSupplierId] = useState(defaultSupplier ?? "")
  const [jobId, setJobId] = useState(defaultJob ?? "")
  const [expected, setExpected] = useState("")
  const [vatRate, setVatRate] = useState(VAT_RATE)
  const [notes, setNotes] = useState("")
  const [lines, setLines] = useState<Line[]>([newLine()])

  const update = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0)
  const vat = (subtotal * vatRate) / 100
  const total = subtotal + vat

  function pickItem(key: string, itemId: string) {
    const it = items.find((i) => i.id === itemId)
    update(key, { item_id: itemId, description: it ? it.name : "", unit_cost: it ? Number(it.cost_price) : 0 })
  }

  function submit() {
    start(async () => {
      await createPurchaseOrder({
        supplierId: supplierId || null,
        jobId: jobId || null,
        expectedDate: expected || null,
        vatRate,
        notes,
        items: lines.map((l) => ({
          description: l.description,
          item_id: l.item_id || null,
          quantity: Number(l.quantity) || 0,
          unit_cost: Number(l.unit_cost) || 0,
        })),
      })
    })
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="supplier">Supplier</Label>
            <Select id="supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— Select supplier —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="job">Link to job (optional)</Label>
            <Select id="job" value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">— None —</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.job_number} · {j.customer_name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="expected">Expected date</Label>
            <Input id="expected" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="vat">VAT rate (%)</Label>
            <Input id="vat" type="number" value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))} />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Line Items</h2>
          <Button size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, newLine()])}>
            <Plus className="h-4 w-4" /> Add line
          </Button>
        </div>
        <div className="space-y-3">
          {lines.map((l) => (
            <div key={l.key} className="grid grid-cols-12 items-end gap-2">
              <div className="col-span-12 sm:col-span-5">
                <Label htmlFor={`d${l.key}`}>Description</Label>
                <div className="flex gap-2">
                  <Select
                    aria-label="Pick inventory item"
                    value={l.item_id}
                    onChange={(e) => pickItem(l.key, e.target.value)}
                    className="w-28 shrink-0"
                  >
                    <option value="">Manual</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    id={`d${l.key}`}
                    value={l.description}
                    onChange={(e) => update(l.key, { description: e.target.value })}
                    placeholder="Part / description"
                  />
                </div>
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Label htmlFor={`q${l.key}`}>Qty</Label>
                <Input
                  id={`q${l.key}`}
                  type="number"
                  value={l.quantity}
                  onChange={(e) => update(l.key, { quantity: Number(e.target.value) })}
                />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Label htmlFor={`u${l.key}`}>Unit cost</Label>
                <Input
                  id={`u${l.key}`}
                  type="number"
                  value={l.unit_cost}
                  onChange={(e) => update(l.key, { unit_cost: Number(e.target.value) })}
                />
              </div>
              <div className="col-span-3 sm:col-span-2">
                <Label>Total</Label>
                <div className="flex h-10 items-center px-1 text-sm tabular-nums text-muted-foreground">
                  {formatCurrency((Number(l.quantity) || 0) * (Number(l.unit_cost) || 0))}
                </div>
              </div>
              <div className="col-span-1 flex justify-end">
                <button
                  onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.key !== l.key) : ls))}
                  className="mb-1 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-red-400"
                  aria-label="Remove line"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex justify-end">
          <div className="w-full max-w-xs space-y-1.5 text-sm">
            <Row label="Subtotal" value={formatCurrency(subtotal)} />
            <Row label={`VAT (${vatRate}%)`} value={formatCurrency(vat)} />
            <div className="flex items-center justify-between border-t border-border pt-2 text-base font-bold">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-16" />
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending || !supplierId}>
          {pending ? "Creating…" : "Create Purchase Order"}
        </Button>
      </div>
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

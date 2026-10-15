"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, Button, Input, Label, Select, Textarea } from "@/components/ui"
import { createInvoice } from "@/lib/actions-crm"
import { formatCurrency } from "@/lib/utils"
import { Plus, Trash2 } from "lucide-react"
import { BILLING_LABELS, isFree, type BillingType } from "@/lib/invoice-line"

type Job = {
  id: string
  job_number: string
  customer_name: string | null
  customer_mobile: string | null
  vehicle_year: number | null
  vehicle_make: string | null
  vehicle_model: string | null
  plate_emirate: string | null
  plate_code: string | null
  plate_number: string | null
}
type Line = {
  key: string
  kind: "part" | "labour" | "fee"
  description: string
  quantity: number
  unit_price: number
  billing_type: BillingType
  free_reason: string
  warranty_value: number
  warranty_unit: "" | "days" | "months"
}
type Prefill = {
  jobId: string
  customerName: string
  customerMobile: string
  vehicleDesc: string
  plate: string
  discount: number
  vatRate: number
  items: { kind: "part" | "labour" | "fee"; description: string; quantity: number; unit_price: number }[]
}

let counter = 0
const line = (p?: Partial<Line>): Line => ({
  key: `l${counter++}`,
  kind: p?.kind ?? "part",
  description: p?.description ?? "",
  quantity: p?.quantity ?? 1,
  unit_price: p?.unit_price ?? 0,
  billing_type: p?.billing_type ?? "normal",
  free_reason: p?.free_reason ?? "",
  warranty_value: p?.warranty_value ?? 0,
  warranty_unit: p?.warranty_unit ?? "",
})

const lineValue = (l: Line) => (Number(l.quantity) || 0) * (Number(l.unit_price) || 0)

export function InvoiceForm({ jobs, prefill, defaultVat }: { jobs: Job[]; prefill: Prefill | null; defaultVat: number }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const [jobId, setJobId] = useState(prefill?.jobId ?? "")
  const [customerName, setCustomerName] = useState(prefill?.customerName ?? "")
  const [customerMobile, setCustomerMobile] = useState(prefill?.customerMobile ?? "")
  const [customerTrn, setCustomerTrn] = useState("")
  const [vehicleDesc, setVehicleDesc] = useState(prefill?.vehicleDesc ?? "")
  const [plate, setPlate] = useState(prefill?.plate ?? "")
  const [dueDate, setDueDate] = useState("")
  const [discount, setDiscount] = useState(prefill?.discount ?? 0)
  const [vatRate, setVatRate] = useState(prefill?.vatRate ?? defaultVat)
  const [notes, setNotes] = useState("")
  const [formError, setFormError] = useState<{
    error: string
    existingInvoiceId?: string
    existingInvoiceNumber?: string
  } | null>(null)
  const [lines, setLines] = useState<Line[]>(
    prefill?.items?.length ? prefill.items.map((i) => line(i)) : [line()],
  )

  const update = (key: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const gross = lines.reduce((s, l) => s + (isFree(l.billing_type) ? 0 : lineValue(l)), 0)
  const freeValue = lines.reduce((s, l) => s + (isFree(l.billing_type) ? lineValue(l) : 0), 0)
  const missingReason = lines.some((l) => l.description.trim() && isFree(l.billing_type) && !l.free_reason.trim())
  const missingWarranty = lines.some((l) => l.description.trim() && l.warranty_unit && !(Number(l.warranty_value) > 0))
  const subtotal = Math.max(0, gross - (Number(discount) || 0))
  const vat = (subtotal * vatRate) / 100
  const total = subtotal + vat

  function onJobChange(id: string) {
    setJobId(id)
    const j = jobs.find((x) => x.id === id)
    if (j) {
      setCustomerName(j.customer_name ?? "")
      setCustomerMobile(j.customer_mobile ?? "")
      setVehicleDesc([j.vehicle_year, j.vehicle_make, j.vehicle_model].filter(Boolean).join(" "))
      setPlate([j.plate_emirate, j.plate_code, j.plate_number].filter(Boolean).join(" "))
    }
  }

  function submit() {
    setFormError(null)
    start(async () => {
      const res = await createInvoice({
        jobId: jobId || null,
        customerName,
        customerMobile,
        customerTrn,
        vehicleDesc,
        plate,
        dueDate: dueDate || null,
        discount: Number(discount) || 0,
        vatRate,
        notes,
        items: lines.map((l) => ({
          kind: l.kind,
          description: l.description,
          quantity: Number(l.quantity) || 0,
          unit_price: Number(l.unit_price) || 0,
          billing_type: l.billing_type,
          free_reason: isFree(l.billing_type) ? l.free_reason.trim() : null,
          warranty_value: l.warranty_unit ? Number(l.warranty_value) || 0 : null,
          warranty_unit: l.warranty_unit || null,
        })),
      })
      if (res?.error) setFormError(res)
    })
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="job">Link to job (optional — prefills customer)</Label>
            <Select id="job" value={jobId} onChange={(e) => onJobChange(e.target.value)}>
              <option value="">— Manual invoice —</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.job_number} · {j.customer_name}
                </option>
              ))}
            </Select>
          </div>
          <FieldC label="Customer name" value={customerName} onChange={setCustomerName} required />
          <FieldC label="Mobile" value={customerMobile} onChange={setCustomerMobile} />
          <FieldC label="Customer TRN" value={customerTrn} onChange={setCustomerTrn} />
          <FieldC label="Plate" value={plate} onChange={setPlate} />
          <FieldC label="Vehicle" value={vehicleDesc} onChange={setVehicleDesc} />
          <div>
            <Label htmlFor="due">Due date</Label>
            <Input id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Line Items</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, line({ kind: "part" })])}>
              <Plus className="h-4 w-4" /> Part
            </Button>
            <Button size="sm" variant="outline" onClick={() => setLines((ls) => [...ls, line({ kind: "labour" })])}>
              <Plus className="h-4 w-4" /> Labour
            </Button>
          </div>
        </div>
        <div className="space-y-3">
          {lines.map((l) => (
            <div key={l.key} className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <div className="grid grid-cols-12 items-end gap-2">
              <div className="col-span-6 sm:col-span-2">
                <Label htmlFor={`k${l.key}`}>Type</Label>
                <Select id={`k${l.key}`} value={l.kind} onChange={(e) => update(l.key, { kind: e.target.value as Line["kind"] })}>
                  <option value="part">Part</option>
                  <option value="labour">Labour</option>
                  <option value="fee">Fee</option>
                </Select>
              </div>
              <div className="col-span-12 sm:col-span-4">
                <Label htmlFor={`d${l.key}`}>Description</Label>
                <Input id={`d${l.key}`} value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Label htmlFor={`q${l.key}`}>{l.kind === "labour" ? "Hours" : "Qty"}</Label>
                <Input id={`q${l.key}`} type="number" value={l.quantity} onChange={(e) => update(l.key, { quantity: Number(e.target.value) })} />
              </div>
              <div className="col-span-4 sm:col-span-2">
                <Label htmlFor={`u${l.key}`}>{l.kind === "labour" ? "Rate" : "Unit"}</Label>
                <Input id={`u${l.key}`} type="number" value={l.unit_price} onChange={(e) => update(l.key, { unit_price: Number(e.target.value) })} />
              </div>
              <div className="col-span-3 sm:col-span-1">
                <Label>Total</Label>
                <div className="flex h-10 flex-col justify-center text-xs tabular-nums text-muted-foreground">
                  {isFree(l.billing_type) ? (
                    <>
                      <span className="line-through">{formatCurrency(lineValue(l))}</span>
                      <span className="font-semibold text-primary">FREE</span>
                    </>
                  ) : (
                    formatCurrency(lineValue(l))
                  )}
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
            <div className="grid grid-cols-12 items-end gap-2">
              <div className="col-span-12 sm:col-span-4">
                <Label htmlFor={`b${l.key}`}>Billing</Label>
                <Select
                  id={`b${l.key}`}
                  value={l.billing_type}
                  onChange={(e) => update(l.key, { billing_type: e.target.value as BillingType })}
                >
                  {(Object.keys(BILLING_LABELS) as BillingType[]).map((b) => (
                    <option key={b} value={b}>
                      {BILLING_LABELS[b]}
                    </option>
                  ))}
                </Select>
              </div>
              {isFree(l.billing_type) && (
                <div className="col-span-12 sm:col-span-4">
                  <Label htmlFor={`r${l.key}`}>Reason (shown on invoice)</Label>
                  <Input
                    id={`r${l.key}`}
                    value={l.free_reason}
                    maxLength={300}
                    placeholder={l.billing_type === "warranty" ? "e.g. Covered by warranty from INV-0123" : "e.g. Goodwill for delay"}
                    onChange={(e) => update(l.key, { free_reason: e.target.value })}
                    aria-invalid={!!l.description.trim() && !l.free_reason.trim()}
                  />
                </div>
              )}
              <div className={isFree(l.billing_type) ? "col-span-12 sm:col-span-4" : "col-span-12 sm:col-span-8"}>
                <Label htmlFor={`wu${l.key}`}>Warranty we give</Label>
                <div className="flex gap-2">
                  <Select
                    id={`wu${l.key}`}
                    value={l.warranty_unit}
                    onChange={(e) => update(l.key, { warranty_unit: e.target.value as Line["warranty_unit"] })}
                    className="flex-1"
                  >
                    <option value="">No warranty</option>
                    <option value="days">Days</option>
                    <option value="months">Months</option>
                  </Select>
                  {l.warranty_unit && (
                    <Input
                      type="number"
                      min={1}
                      aria-label={`Warranty ${l.warranty_unit}`}
                      value={l.warranty_value || ""}
                      onChange={(e) => update(l.key, { warranty_value: Number(e.target.value) })}
                      className="w-24"
                    />
                  )}
                </div>
              </div>
            </div>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-col items-end gap-3">
          <div className="flex items-center gap-3">
            <Label htmlFor="discount" className="mb-0">
              Discount
            </Label>
            <Input id="discount" type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="w-32" />
            <Label htmlFor="vat" className="mb-0">
              VAT %
            </Label>
            <Input id="vat" type="number" value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))} className="w-20" />
          </div>
          <div className="w-full max-w-xs space-y-1.5 text-sm">
            {freeValue > 0 && <Row label="Free items (not charged)" value={formatCurrency(freeValue)} />}
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

      {formError && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-pretty leading-relaxed">{formError.error}</p>
          {formError.existingInvoiceId && (
            <Button onClick={() => router.push(`/invoices/${formError.existingInvoiceId}`)}>
              Open {formError.existingInvoiceNumber}
            </Button>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={pending || !customerName.trim() || missingReason || missingWarranty}>
          {pending ? "Creating…" : "Create Invoice"}
        </Button>
      </div>
    </div>
  )
}

function FieldC({
  label,
  value,
  onChange,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  required?: boolean
}) {
  const id = label.replace(/\s+/g, "-").toLowerCase()
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} required={required} />
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

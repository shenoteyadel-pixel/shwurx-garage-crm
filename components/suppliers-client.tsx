"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { Card, Button, Input, Label, Textarea, Badge } from "@/components/ui"
import { Modal } from "@/components/modal"
import { saveSupplier, deleteSupplier } from "@/lib/actions-crm"
import { formatCurrency } from "@/lib/utils"
import { Plus, Search, Pencil, Trash2, Phone, Building2 } from "lucide-react"

type Supplier = {
  id: string
  name: string
  contact_person: string | null
  mobile: string | null
  whatsapp: string | null
  email: string | null
  trn: string | null
  address: string | null
  brands: string | null
  credit_terms: string | null
  opening_balance: number
  notes: string | null
  total_spend: number
  outstanding: number
  order_count: number
}

export function SuppliersClient({ suppliers }: { suppliers: Supplier[] }) {
  const [q, setQ] = useState("")
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [open, setOpen] = useState(false)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return suppliers
    return suppliers.filter((x) =>
      [x.name, x.contact_person, x.mobile, x.brands, x.trn].filter(Boolean).some((v) => v!.toLowerCase().includes(s)),
    )
  }, [q, suppliers])

  const totalOutstanding = suppliers.reduce((s, x) => s + x.outstanding, 0)

  function openNew() {
    setEditing(null)
    setOpen(true)
  }
  function openEdit(s: Supplier) {
    setEditing(s)
    setOpen(true)
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-sm text-muted-foreground">
            {suppliers.length} suppliers · {formatCurrency(totalOutstanding)} outstanding
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search suppliers…" className="w-56 pl-9" />
          </div>
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" /> New Supplier
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-16 text-center">
          <Building2 className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No suppliers yet. Add your first parts supplier.</p>
          <Button onClick={openNew} variant="outline" className="mt-2">
            <Plus className="h-4 w-4" /> New Supplier
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <Card key={s.id} className="flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{s.name}</div>
                  {s.contact_person && <div className="truncate text-xs text-muted-foreground">{s.contact_person}</div>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => openEdit(s)}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label="Edit supplier"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {s.brands && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {s.brands.split(",").slice(0, 4).map((b) => (
                    <Badge key={b} className="border-border bg-secondary text-secondary-foreground">
                      {b.trim()}
                    </Badge>
                  ))}
                </div>
              )}

              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {s.mobile && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3" /> {s.mobile}
                  </div>
                )}
                {s.trn && <div>TRN {s.trn}</div>}
                {s.credit_terms && <div>Terms: {s.credit_terms}</div>}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm">
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Spend</div>
                  <div className="font-medium tabular-nums">{formatCurrency(s.total_spend)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Outstanding</div>
                  <div
                    className={`font-medium tabular-nums ${s.outstanding > 0.01 ? "text-amber-400" : "text-emerald-400"}`}
                  >
                    {formatCurrency(s.outstanding)}
                  </div>
                </div>
              </div>

              <Link
                href={`/purchasing?supplier=${s.id}`}
                className="mt-3 text-center text-xs font-medium text-primary hover:underline"
              >
                View {s.order_count} purchase orders →
              </Link>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Supplier" : "New Supplier"}>
        <SupplierForm supplier={editing} onDone={() => setOpen(false)} />
      </Modal>
    </>
  )
}

function SupplierForm({ supplier, onDone }: { supplier: Supplier | null; onDone: () => void }) {
  const [pending, start] = useTransition()
  const [delPending, startDel] = useTransition()

  return (
    <form
      action={(fd) =>
        start(async () => {
          await saveSupplier(fd)
          onDone()
        })
      }
      className="space-y-4"
    >
      {supplier && <input type="hidden" name="id" value={supplier.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Supplier name" name="name" defaultValue={supplier?.name} required />
        <F label="Contact person" name="contact_person" defaultValue={supplier?.contact_person} />
        <F label="Mobile" name="mobile" defaultValue={supplier?.mobile} />
        <F label="WhatsApp" name="whatsapp" defaultValue={supplier?.whatsapp} />
        <F label="Email" name="email" type="email" defaultValue={supplier?.email} />
        <F label="TRN" name="trn" defaultValue={supplier?.trn} />
        <F label="Brands supplied (comma sep)" name="brands" defaultValue={supplier?.brands} />
        <F label="Credit terms" name="credit_terms" defaultValue={supplier?.credit_terms} placeholder="e.g. Net 30" />
        <F label="Opening balance (AED)" name="opening_balance" type="number" defaultValue={supplier?.opening_balance} />
      </div>
      <div>
        <Label htmlFor="address">Address</Label>
        <Textarea id="address" name="address" defaultValue={supplier?.address ?? ""} className="min-h-16" />
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" defaultValue={supplier?.notes ?? ""} className="min-h-16" />
      </div>
      <div className="flex items-center justify-between">
        {supplier ? (
          <Button
            type="button"
            variant="danger"
            disabled={delPending}
            onClick={() =>
              startDel(async () => {
                await deleteSupplier(supplier.id)
                onDone()
              })
            }
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save Supplier"}
          </Button>
        </div>
      </div>
    </form>
  )
}

function F({
  label,
  name,
  defaultValue,
  type = "text",
  required,
  placeholder,
}: {
  label: string
  name: string
  defaultValue?: string | number | null
  type?: string
  required?: boolean
  placeholder?: string
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue ?? ""} required={required} placeholder={placeholder} />
    </div>
  )
}

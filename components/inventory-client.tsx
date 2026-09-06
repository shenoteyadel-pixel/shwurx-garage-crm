"use client"

import { useMemo, useState, useTransition } from "react"
import { Card, Button, Input, Label, Select, Textarea, Badge } from "@/components/ui"
import { Modal } from "@/components/modal"
import { saveInventoryItem, deleteInventoryItem, recordStockMovement } from "@/lib/actions-crm"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Plus, Search, Pencil, Trash2, PackagePlus, PackageMinus, SlidersHorizontal, AlertTriangle, Boxes, History } from "lucide-react"

type Item = {
  id: string
  sku: string | null
  crm_part_id: string | null
  oem_part_number: string | null
  supplier_part_number: string | null
  name: string
  category: string | null
  brand: string | null
  unit: string
  cost_price?: number | null
  sale_price: number
  quantity: number
  reorder_level: number
  location: string | null
  supplier_id: string | null
  notes: string | null
}
type Supplier = { id: string; name: string }
type Movement = {
  id: string
  item_id: string
  kind: "in" | "out" | "adjust"
  quantity: number
  unit_cost: number
  reference: string | null
  note: string | null
  created_at: string
  inventory_items: { name: string } | null
}

export function InventoryClient({
  items,
  suppliers,
  movements,
  canViewCosts = true,
  canViewSuppliers = true,
}: {
  items: Item[]
  suppliers: Supplier[]
  movements: Movement[]
  canViewCosts?: boolean
  canViewSuppliers?: boolean
}) {
  const [q, setQ] = useState("")
  const [tab, setTab] = useState<"stock" | "history">("stock")
  const [editing, setEditing] = useState<Item | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [moveItem, setMoveItem] = useState<{ item: Item; kind: "in" | "out" | "adjust" } | null>(null)
  const [historyItem, setHistoryItem] = useState<Item | null>(null)

  const supplierName = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return items
    // Search spans every identifier the spec requires: CRM Part ID, OEM number,
    // supplier part number, name, brand, category, location and supplier name.
    return items.filter((x) =>
      [
        x.name,
        x.sku,
        x.crm_part_id,
        x.oem_part_number,
        x.supplier_part_number,
        x.brand,
        x.category,
        x.location,
        x.supplier_id ? supplierName.get(x.supplier_id) : null,
      ]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(s)),
    )
  }, [q, items, supplierName])

  const stockValue = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.cost_price) || 0), 0)
  const lowStock = items.filter((i) => Number(i.reorder_level) > 0 && Number(i.quantity) <= Number(i.reorder_level))
  const showHistory = canViewCosts

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Store &amp; Inventory</h1>
          <p className="text-sm text-muted-foreground">
            {items.length} items
            {canViewCosts && <> · stock value {formatCurrency(stockValue)}</>}
            {lowStock.length > 0 && <span className="text-amber-400"> · {lowStock.length} low</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, CRM ID, OEM…"
              className="w-56 pl-9"
            />
          </div>
          <Button
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus className="h-4 w-4" /> New Item
          </Button>
        </div>
      </div>

      {lowStock.length > 0 && (
        <Card className="mb-4 flex items-center gap-3 border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Low stock: {lowStock.map((i) => i.name).slice(0, 5).join(", ")}
            {lowStock.length > 5 ? ` +${lowStock.length - 5} more` : ""}
          </span>
        </Card>
      )}

      <div className="mb-4 flex gap-1 border-b border-border">
        <TabBtn active={tab === "stock"} onClick={() => setTab("stock")}>
          Stock List
        </TabBtn>
        {showHistory && (
          <TabBtn active={tab === "history"} onClick={() => setTab("history")}>
            Movement History
          </TabBtn>
        )}
      </div>

      {tab === "stock" || !showHistory ? (
        filtered.length === 0 ? (
          <Empty onNew={() => setFormOpen(true)} />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Item</th>
                    <th className="px-4 py-3 font-semibold">Location</th>
                    {canViewCosts && <th className="px-4 py-3 text-right font-semibold">Cost</th>}
                    <th className="px-4 py-3 text-right font-semibold">Sale</th>
                    <th className="px-4 py-3 text-right font-semibold">Qty</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((i) => {
                    const low = Number(i.reorder_level) > 0 && Number(i.quantity) <= Number(i.reorder_level)
                    return (
                      <tr key={i.id} className="border-b border-border/60 last:border-0">
                        <td className="px-4 py-3">
                          <div className="font-medium">{i.name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            {i.crm_part_id && <span className="font-mono text-foreground/70">{i.crm_part_id}</span>}
                            {i.oem_part_number && <span className="font-mono">OEM {i.oem_part_number}</span>}
                            {canViewSuppliers && i.supplier_part_number && <span>Supp {i.supplier_part_number}</span>}
                            {i.brand && <span>{i.brand}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{i.location || "—"}</td>
                        {canViewCosts && (
                          <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(i.cost_price ?? 0)}</td>
                        )}
                        <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(i.sale_price)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`tabular-nums font-semibold ${low ? "text-amber-400" : ""}`}>
                            {Number(i.quantity)} {i.unit}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <IconBtn title="Stock In" onClick={() => setMoveItem({ item: i, kind: "in" })}>
                              <PackagePlus className="h-4 w-4 text-emerald-400" />
                            </IconBtn>
                            <IconBtn title="Stock Out" onClick={() => setMoveItem({ item: i, kind: "out" })}>
                              <PackageMinus className="h-4 w-4 text-red-400" />
                            </IconBtn>
                            <IconBtn title="Adjust" onClick={() => setMoveItem({ item: i, kind: "adjust" })}>
                              <SlidersHorizontal className="h-4 w-4 text-sky-400" />
                            </IconBtn>
                            {canViewCosts && (
                              <IconBtn title="Purchase history" onClick={() => setHistoryItem(i)}>
                                <History className="h-4 w-4 text-muted-foreground" />
                              </IconBtn>
                            )}
                            <IconBtn
                              title="Edit"
                              onClick={() => {
                                setEditing(i)
                                setFormOpen(true)
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </IconBtn>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )
      ) : (
        <Card className="overflow-hidden">
          {movements.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No stock movements yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Item</th>
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 text-right font-semibold">Qty</th>
                    <th className="px-4 py-3 font-semibold">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(m.created_at)}</td>
                      <td className="px-4 py-3 font-medium">{m.inventory_items?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <MoveBadge kind={m.kind} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {m.kind === "out" ? "−" : m.kind === "in" ? "+" : ""}
                        {Math.abs(Number(m.quantity))}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{m.reference || m.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Edit Item" : "New Item"}>
        <ItemForm
          item={editing}
          suppliers={suppliers}
          canViewCosts={canViewCosts}
          canViewSuppliers={canViewSuppliers}
          onDone={() => setFormOpen(false)}
        />
      </Modal>

      <Modal
        open={!!moveItem}
        onClose={() => setMoveItem(null)}
        size="sm"
        title={
          moveItem
            ? `${moveItem.kind === "in" ? "Stock In" : moveItem.kind === "out" ? "Stock Out" : "Adjust"} · ${moveItem.item.name}`
            : ""
        }
      >
        {moveItem && (
          <MovementForm move={moveItem} canViewCosts={canViewCosts} onDone={() => setMoveItem(null)} />
        )}
      </Modal>

      <Modal
        open={!!historyItem}
        onClose={() => setHistoryItem(null)}
        title={historyItem ? `Purchase history · ${historyItem.name}` : ""}
      >
        {historyItem && (
          <PurchaseHistory
            item={historyItem}
            movements={movements.filter((m) => m.item_id === historyItem.id)}
          />
        )}
      </Modal>
    </>
  )
}

function PurchaseHistory({ item, movements }: { item: Item; movements: Movement[] }) {
  const purchases = movements.filter((m) => m.kind === "in")
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-border bg-secondary/40 p-3 text-xs">
        {item.crm_part_id && (
          <span>
            <span className="text-muted-foreground">CRM Part ID</span>{" "}
            <span className="font-mono">{item.crm_part_id}</span>
          </span>
        )}
        <span>
          <span className="text-muted-foreground">OEM</span>{" "}
          <span className="font-mono">{item.oem_part_number || "Not Available / Pending"}</span>
        </span>
      </div>
      {purchases.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No recorded purchases yet. Confirmed supplier invoices for this part will appear here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-semibold">Date</th>
                <th className="py-2 pr-3 font-semibold">Reference</th>
                <th className="py-2 pr-3 text-right font-semibold">Qty</th>
                <th className="py-2 text-right font-semibold">Unit cost</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((m) => (
                <tr key={m.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3 text-muted-foreground">{formatDate(m.created_at)}</td>
                  <td className="py-2 pr-3">{m.reference || m.note || "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">+{Math.abs(Number(m.quantity))}</td>
                  <td className="py-2 text-right tabular-nums">{formatCurrency(Number(m.unit_cost) || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Every purchase is kept against this one CRM Part ID — historical costs are preserved and never overwritten.
      </p>
    </div>
  )
}

function ItemForm({
  item,
  suppliers,
  canViewCosts,
  canViewSuppliers,
  onDone,
}: {
  item: Item | null
  suppliers: Supplier[]
  canViewCosts: boolean
  canViewSuppliers: boolean
  onDone: () => void
}) {
  const [pending, start] = useTransition()
  const [delPending, startDel] = useTransition()
  return (
    <form
      action={(fd) =>
        start(async () => {
          await saveInventoryItem(fd)
          onDone()
        })
      }
      className="space-y-4"
    >
      {item && <input type="hidden" name="id" value={item.id} />}
      {item?.crm_part_id && (
        <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">CRM Part ID</span>{" "}
          <span className="font-mono font-semibold">{item.crm_part_id}</span>
          <span className="ml-2 text-xs text-muted-foreground">· permanent, auto-generated</span>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Item name" name="name" defaultValue={item?.name} required />
        <F label="OEM part number" name="oem_part_number" defaultValue={item?.oem_part_number} placeholder="e.g. A2059053414" />
        {canViewSuppliers && (
          <F label="Supplier part number" name="supplier_part_number" defaultValue={item?.supplier_part_number} />
        )}
        <F label="Internal SKU (optional)" name="sku" defaultValue={item?.sku} />
        <F label="Category" name="category" defaultValue={item?.category} />
        <F label="Brand" name="brand" defaultValue={item?.brand} />
        <F label="Unit" name="unit" defaultValue={item?.unit ?? "pcs"} />
        <F label="Location / Shelf" name="location" defaultValue={item?.location} />
        {canViewCosts && (
          <F label="Cost price (AED)" name="cost_price" type="number" defaultValue={item?.cost_price} />
        )}
        <F label="Sale price (AED)" name="sale_price" type="number" defaultValue={item?.sale_price} />
        <F label="Reorder level" name="reorder_level" type="number" defaultValue={item?.reorder_level} />
        {!item && <F label="Opening quantity" name="quantity" type="number" defaultValue={0} />}
        {canViewSuppliers && (
          <div className={item ? "sm:col-span-2" : ""}>
            <Label htmlFor="supplier_id">Default supplier</Label>
            <Select id="supplier_id" name="supplier_id" defaultValue={item?.supplier_id ?? ""}>
              <option value="">— None —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" defaultValue={item?.notes ?? ""} className="min-h-14" />
      </div>
      <div className="flex items-center justify-between">
        {item ? (
          <Button
            type="button"
            variant="danger"
            disabled={delPending}
            onClick={() => startDel(async () => {
              await deleteInventoryItem(item.id)
              onDone()
            })}
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
            {pending ? "Saving…" : "Save Item"}
          </Button>
        </div>
      </div>
    </form>
  )
}

function MovementForm({
  move,
  canViewCosts,
  onDone,
}: {
  move: { item: Item; kind: "in" | "out" | "adjust" }
  canViewCosts: boolean
  onDone: () => void
}) {
  const [pending, start] = useTransition()
  const { item, kind } = move
  return (
    <form
      action={(fd) =>
        start(async () => {
          await recordStockMovement(fd)
          onDone()
        })
      }
      className="space-y-4"
    >
      <input type="hidden" name="item_id" value={item.id} />
      <input type="hidden" name="kind" value={kind} />
      <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm">
        Current stock: <span className="font-semibold tabular-nums">{Number(item.quantity)} {item.unit}</span>
      </div>
      <F
        label={kind === "adjust" ? "New absolute quantity" : "Quantity"}
        name="quantity"
        type="number"
        defaultValue={kind === "adjust" ? item.quantity : ""}
        required
      />
      {kind === "in" && canViewCosts && (
        <F label="Unit cost (AED)" name="unit_cost" type="number" defaultValue={item.cost_price ?? undefined} />
      )}
      <F label="Reference" name="reference" placeholder={kind === "out" ? "Job / issued to" : "Supplier invoice / reason"} />
      <div>
        <Label htmlFor="note">Note</Label>
        <Textarea id="note" name="note" className="min-h-14" />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Record"}
        </Button>
      </div>
    </form>
  )
}

function MoveBadge({ kind }: { kind: "in" | "out" | "adjust" }) {
  const map = {
    in: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
    out: "border-red-500/30 bg-red-500/15 text-red-300",
    adjust: "border-sky-500/30 bg-sky-500/15 text-sky-300",
  }
  return <Badge className={map[kind]}>{kind === "in" ? "Stock In" : kind === "out" ? "Stock Out" : "Adjust"}</Badge>
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  )
}

function IconBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded-md p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  )
}

function Empty({ onNew }: { onNew: () => void }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-2 p-16 text-center">
      <Boxes className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">No inventory items yet.</p>
      <Button onClick={onNew} variant="outline" className="mt-2">
        <Plus className="h-4 w-4" /> New Item
      </Button>
    </Card>
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

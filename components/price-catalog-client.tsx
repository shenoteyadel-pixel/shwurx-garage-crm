"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Button, Card, Input, Label, Select, Badge } from "@/components/ui"
import { formatCurrency } from "@/lib/utils"
import { CATALOG_ITEM_TYPES, CATALOG_QUALITIES } from "@/lib/parts-catalog"
import {
  createCatalogItem,
  decidePriceRevision,
  requestPriceRevision,
  retireCatalogItem,
  type CatalogEntry,
} from "@/lib/actions-parts-catalog"
import { Plus, History, Check, X, Search } from "lucide-react"

type Props = {
  entries: CatalogEntry[]
  canEdit: boolean
  canApprove: boolean
  currentUserId: string
}

const EMPTY_SPEC = {
  item_type: "part",
  name: "",
  brand: "",
  manufacturer: "",
  part_number: "",
  quality: "genuine",
  condition: "",
  specification: "",
  product_line: "",
  viscosity: "",
  approvals: "",
  package_size: "",
  unit: "each",
  used_item_ref: "",
  warranty_months: "",
}

export function PriceCatalogClient({ entries, canEdit, canApprove, currentUserId }: Props) {
  const router = useRouter()
  const [query, setQuery] = React.useState("")
  const [showRetired, setShowRetired] = React.useState(false)
  const [adding, setAdding] = React.useState(false)

  const pending = entries.filter((e) => e.pending)
  const visible = entries.filter((e) => {
    if (!showRetired && e.retired_at) return false
    const q = query.trim().toLowerCase()
    return !q || e.label.toLowerCase().includes(q) || (e.part_number ?? "").toLowerCase().includes(q)
  })

  return (
    <div className="flex flex-col gap-6">
      {canApprove && pending.length > 0 && (
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-sm font-semibold">Price changes waiting for approval ({pending.length})</h2>
          {pending.map((e) => (
            <PendingRow key={e.id} entry={e} currentUserId={currentUserId} onDone={() => router.refresh()} />
          ))}
        </Card>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            aria-label="Search catalog"
            placeholder="Search name, brand or part number"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
            Show retired
          </label>
          {canEdit && (
            <Button size="sm" onClick={() => setAdding((v) => !v)}>
              <Plus className="h-4 w-4" aria-hidden />
              Add item
            </Button>
          )}
        </div>
      </div>

      {adding && canEdit && (
        <NewItemForm
          onDone={() => {
            setAdding(false)
            router.refresh()
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      <Card className="divide-y divide-border">
        {visible.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No catalog items yet.</p>
        ) : (
          visible.map((e) => <CatalogRow key={e.id} entry={e} canEdit={canEdit} onDone={() => router.refresh()} />)
        )}
      </Card>
    </div>
  )
}

function CatalogRow({ entry, canEdit, onDone }: { entry: CatalogEntry; canEdit: boolean; onDone: () => void }) {
  const [open, setOpen] = React.useState(false)
  const [revising, setRevising] = React.useState(false)
  const [price, setPrice] = React.useState("")
  const [reason, setReason] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function submitRevision() {
    setBusy(true)
    setError(null)
    const res = await requestPriceRevision({ catalogId: entry.id, sellingPrice: Number(price), reason })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setRevising(false)
    setPrice("")
    setReason("")
    onDone()
  }

  async function retire() {
    if (!confirm("Retire this item? It will no longer be offered on new quotations. History is kept.")) return
    const res = await retireCatalogItem(entry.id)
    if (!res.ok) return setError(res.error)
    onDone()
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-medium text-pretty">{entry.label}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge>{CATALOG_QUALITIES.find((q) => q.value === entry.quality)?.label ?? entry.quality}</Badge>
            {entry.part_number && <span className="font-mono">{entry.part_number}</span>}
            <span>per {entry.unit}</span>
            {entry.retired_at && <Badge>Retired</Badge>}
            {entry.pending && <Badge>Change pending: {formatCurrency(entry.pending.selling_price)}</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-lg font-semibold tabular-nums">
            {entry.current ? formatCurrency(entry.current.selling_price) : <span className="text-sm text-muted-foreground">No approved price</span>}
          </p>
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            <History className="h-4 w-4" aria-hidden />
            <span className="sr-only">Price history</span>
          </Button>
        </div>
      </div>

      {open && (
        <ol className="flex flex-col gap-1 rounded-lg border border-border p-3 text-xs">
          {entry.revisions.map((r) => (
            <li key={r.id} className="flex flex-wrap gap-x-3 gap-y-1">
              <span className="font-medium tabular-nums">{formatCurrency(r.selling_price)}</span>
              <span className="capitalize">{r.status}</span>
              <span className="text-muted-foreground">
                {r.requested_by_name ?? "Staff"}: {r.reason}
              </span>
              {r.decided_at && (
                <span className="text-muted-foreground">
                  {r.status === "approved" ? "approved" : "rejected"} by {r.decided_by_name ?? "manager"} on{" "}
                  {new Date(r.decided_at).toLocaleDateString()}
                  {r.decision_note ? ` (${r.decision_note})` : ""}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {canEdit && !entry.retired_at && (
        <div className="flex flex-wrap items-center gap-2">
          {!revising ? (
            <>
              <Button size="sm" variant="outline" onClick={() => setRevising(true)} disabled={!!entry.pending}>
                Request price change
              </Button>
              <Button size="sm" variant="ghost" onClick={retire}>
                Retire
              </Button>
            </>
          ) : (
            <div className="flex w-full flex-col gap-2 md:flex-row md:items-end">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`price-${entry.id}`}>New selling price (AED, incl. VAT)</Label>
                <Input id={`price-${entry.id}`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor={`reason-${entry.id}`}>Reason</Label>
                <Input id={`reason-${entry.id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={submitRevision} disabled={busy}>
                  Submit for approval
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setRevising(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}

function PendingRow({ entry, currentUserId, onDone }: { entry: CatalogEntry; currentUserId: string; onDone: () => void }) {
  const rev = entry.pending!
  const [note, setNote] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const ownRequest = rev.requested_by === currentUserId

  async function decide(approve: boolean) {
    setBusy(true)
    setError(null)
    const res = await decidePriceRevision({ revisionId: rev.id, approve, note })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onDone()
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <p className="text-sm font-medium">{entry.label}</p>
        <p className="text-sm tabular-nums">
          {entry.current ? formatCurrency(entry.current.selling_price) : "New"} {"→"}{" "}
          <strong>{formatCurrency(rev.selling_price)}</strong>
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        {rev.requested_by_name ?? "Staff"}: {rev.reason}
      </p>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <Input aria-label="Decision note" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex gap-2">
          <Button size="sm" variant="success" onClick={() => decide(true)} disabled={busy || ownRequest}>
            <Check className="h-4 w-4" aria-hidden />
            Approve
          </Button>
          <Button size="sm" variant="danger" onClick={() => decide(false)} disabled={busy}>
            <X className="h-4 w-4" aria-hidden />
            Reject
          </Button>
        </div>
      </div>
      {ownRequest && <p className="text-xs text-muted-foreground">You requested this change, so another manager must approve it.</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}

function NewItemForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [spec, setSpec] = React.useState<Record<string, string>>(EMPTY_SPEC)
  const [price, setPrice] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setSpec((s) => ({ ...s, [key]: e.target.value }))

  const isOil = spec.item_type === "oil"
  const isUsed = spec.quality === "used" || spec.quality === "refurbished"

  async function save() {
    setBusy(true)
    setError(null)
    const res = await createCatalogItem({
      spec: { ...spec, warranty_months: spec.warranty_months === "" ? null : Number(spec.warranty_months) },
      sellingPrice: Number(price),
      reason: "Initial catalog price",
    })
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onDone()
  }

  const field = (key: string, label: string, required = false) => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={`new-${key}`}>
        {label}
        {required && <span className="text-red-400"> *</span>}
      </Label>
      <Input id={`new-${key}`} value={spec[key]} onChange={set(key)} />
    </div>
  )

  return (
    <Card className="flex flex-col gap-4 p-4">
      <h2 className="text-sm font-semibold">New catalog item</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="new-item_type">Type</Label>
          <Select id="new-item_type" value={spec.item_type} onChange={set("item_type")}>
            {CATALOG_ITEM_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="new-quality">Quality</Label>
          <Select id="new-quality" value={spec.quality} onChange={set("quality")}>
            {CATALOG_QUALITIES.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </Select>
        </div>
        {field("name", "Name", true)}
        {field("brand", "Brand")}
        {field("manufacturer", "Manufacturer", isOil)}
        {field("part_number", "Part number")}
        {field("specification", "Specification")}
        {field("unit", "Unit", true)}
        {isOil && field("product_line", "Product line", true)}
        {isOil && field("viscosity", "Viscosity (e.g. 5W-30)", true)}
        {isOil && field("approvals", "OEM approvals")}
        {isOil && field("package_size", "Pack size (e.g. 4L)", true)}
        {isUsed && field("condition", "Condition", true)}
        {isUsed && field("warranty_months", "Warranty (months)", true)}
        {isUsed && field("used_item_ref", "Stock / donor reference")}
        <div className="flex flex-col gap-1">
          <Label htmlFor="new-price">
            Selling price (AED, incl. VAT)<span className="text-red-400"> *</span>
          </Label>
          <Input id="new-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">The first price also needs management approval before it can be quoted.</p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={busy}>
          Save and submit price
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  )
}

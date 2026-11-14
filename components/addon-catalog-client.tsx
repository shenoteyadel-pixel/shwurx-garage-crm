"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Badge, Button, Card, Input, Select, Textarea } from "@/components/ui"
import { cn } from "@/lib/utils"
import { computeLine } from "@/lib/addon-commission"
import { saveAddonPolicy, saveCatalogItem, type CatalogInput } from "@/lib/actions-addon-sales"

const aed = (n: number) => `AED ${n.toFixed(2)}`

const EMPTY: CatalogInput = {
  code: "",
  name: "",
  description: "",
  category: "General",
  kind: "service",
  supplier_id: null,
  inventory_item_id: null,
  purchase_cost: 0,
  extra_cost: 0,
  selling_price: 0,
  commission_pct: 25,
  commission_eligible: true,
  compatible_makes: "",
  interval_km: null,
  interval_months: null,
  active: true,
}

export function AddonCatalogClient({
  items,
  suppliers,
  policy,
}: {
  items: any[]
  suppliers: { id: string; name: string }[]
  policy: { policy: "proportional" | "full_only"; discountAlertPct: number }
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [editing, setEditing] = useState<CatalogInput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pol, setPol] = useState(policy.policy)
  const [alertPct, setAlertPct] = useState(String(policy.discountAlertPct))

  const save = () =>
    editing &&
    start(async () => {
      setError(null)
      const res = await saveCatalogItem(editing)
      if (!res.ok) setError(res.error)
      else {
        setEditing(null)
        router.refresh()
      }
    })

  const preview = editing
    ? computeLine({
        quantity: 1,
        unitPrice: Number(editing.selling_price) || 0,
        unitCost: Number(editing.purchase_cost) || 0,
        unitExtraCost: Number(editing.extra_cost) || 0,
        discount: 0,
        commissionPct: Number(editing.commission_pct) || 0,
        commissionEligible: editing.commission_eligible,
      })
    : null
  const set = <K extends keyof CatalogInput>(k: K, v: CatalogInput[K]) => setEditing((e) => (e ? { ...e, [k]: v } : e))

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-balance text-2xl font-semibold">Add-on catalog</h1>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
            Prices, costs and commission rates here are fixed. Service advisors can recommend these items but cannot change them.
          </p>
        </div>
        <Button onClick={() => setEditing({ ...EMPTY })}>New add-on</Button>
      </header>

      {editing && (
        <Card className="flex flex-col gap-4 p-4">
          <h2 className="text-sm font-semibold">{editing.id ? `Edit ${editing.name}` : "New add-on"}</h2>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <F label="Code">
              <Input value={editing.code} onChange={(e) => set("code", e.target.value)} required />
            </F>
            <F label="Name" wide>
              <Input value={editing.name} onChange={(e) => set("name", e.target.value)} required />
            </F>
            <F label="Category">
              <Input value={editing.category} onChange={(e) => set("category", e.target.value)} />
            </F>
            <F label="Type">
              <Select value={editing.kind} onChange={(e) => set("kind", e.target.value as "product" | "service")}>
                <option value="service">Service</option>
                <option value="product">Product</option>
              </Select>
            </F>
            <F label="Supplier">
              <Select value={editing.supplier_id ?? ""} onChange={(e) => set("supplier_id", e.target.value || null)}>
                <option value="">None</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </F>
            <F label="Purchase cost (AED)">
              <Input type="number" min="0" step="0.01" value={editing.purchase_cost} onChange={(e) => set("purchase_cost", Number(e.target.value))} />
            </F>
            <F label="Labour / extra cost (AED)">
              <Input type="number" min="0" step="0.01" value={editing.extra_cost} onChange={(e) => set("extra_cost", Number(e.target.value))} />
            </F>
            <F label="Selling price ex-VAT (AED)">
              <Input type="number" min="0" step="0.01" value={editing.selling_price} onChange={(e) => set("selling_price", Number(e.target.value))} />
            </F>
            <F label="Commission (% of profit)">
              <Input type="number" min="0" max="100" step="0.5" value={editing.commission_pct} onChange={(e) => set("commission_pct", Number(e.target.value))} />
            </F>
            <F label="Interval (km)">
              <Input type="number" min="0" value={editing.interval_km ?? ""} onChange={(e) => set("interval_km", e.target.value ? Number(e.target.value) : null)} />
            </F>
            <F label="Interval (months)">
              <Input type="number" min="0" value={editing.interval_months ?? ""} onChange={(e) => set("interval_months", e.target.value ? Number(e.target.value) : null)} />
            </F>
            <F label="Compatible makes (comma separated, blank = all)" wide>
              <Input value={editing.compatible_makes ?? ""} onChange={(e) => set("compatible_makes", e.target.value)} />
            </F>
            <F label="Description" full>
              <Textarea rows={2} value={editing.description ?? ""} onChange={(e) => set("description", e.target.value)} />
            </F>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={editing.commission_eligible} onChange={(e) => set("commission_eligible", e.target.checked)} />
              Commission eligible
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={editing.active} onChange={(e) => set("active", e.target.checked)} />
              Active
            </label>
          </div>
          {preview && (
            <p className={cn("text-sm", preview.grossProfit < 0 ? "text-destructive" : "text-muted-foreground")}>
              Profit per unit {aed(preview.grossProfit)} ({preview.marginPct}% margin) · advisor earns {aed(preview.commission)}
              {preview.grossProfit < 0 && " — priced below cost, owners will be alerted"}
            </p>
          )}
          <div className="flex gap-2">
            <Button disabled={pending} onClick={save}>
              Save
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">Add-on catalog</caption>
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Add-on</th>
              <th className="px-4 py-2 text-right font-medium">Cost</th>
              <th className="px-4 py-2 text-right font-medium">Price</th>
              <th className="px-4 py-2 text-right font-medium">Margin</th>
              <th className="px-4 py-2 text-right font-medium">Commission</th>
              <th className="px-4 py-2">
                <span className="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((i) => {
              const l = computeLine({
                quantity: 1,
                unitPrice: i.selling_price,
                unitCost: i.purchase_cost,
                unitExtraCost: i.extra_cost,
                discount: 0,
                commissionPct: i.commission_pct,
                commissionEligible: i.commission_eligible,
              })
              return (
                <tr key={i.id} className={cn(!i.active && "opacity-50")}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium">
                      {i.name}
                      {!i.active && <Badge className="border-border text-muted-foreground">Inactive</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {i.code} · {i.category} · {i.kind}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{aed(l.directCost)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{aed(Number(i.selling_price))}</td>
                  <td className={cn("px-4 py-3 text-right tabular-nums", l.grossProfit < 0 && "text-destructive")}>{l.marginPct}%</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {i.commission_eligible ? `${i.commission_pct}% · ${aed(l.commission)}` : "Not eligible"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing({ ...EMPTY, ...i })}>
                      Edit
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-sm font-semibold">Commission policy</h2>
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            When the invoice is partly paid
            <Select value={pol} onChange={(e) => setPol(e.target.value as "proportional" | "full_only")}>
              <option value="proportional">Earn commission in proportion to payment</option>
              <option value="full_only">Earn nothing until fully paid</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Discount alert threshold (%)
            <Input type="number" min="0" max="100" value={alertPct} onChange={(e) => setAlertPct(e.target.value)} />
          </label>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await saveAddonPolicy(pol, Number(alertPct))
                if (!res.ok) setError(res.error)
                router.refresh()
              })
            }
          >
            Save policy
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Advisors cannot give discounts above the threshold. Only fully earned commission on paid invoices can be paid out.
        </p>
      </Card>
    </main>
  )
}

function F({ label, wide, full, children }: { label: string; wide?: boolean; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={cn("flex flex-col gap-1 text-xs text-muted-foreground", wide && "col-span-2", full && "col-span-2 md:col-span-4")}>
      {label}
      {children}
    </label>
  )
}

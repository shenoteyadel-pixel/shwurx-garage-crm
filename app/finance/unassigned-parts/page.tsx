import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { getShellUser } from "@/lib/shell-user"
import { AppShell } from "@/components/app-shell"

export const metadata = { title: "Parts not on a car · SHWURX Auto Service Center" }

type ItemRow = {
  id: string
  description: string | null
  sku: string | null
  quantity: number | null
  unit_cost: number | null
  line_total: number | null
  inventory_item_id: string | null
  supplier_invoices: {
    id: string
    doc_number: string | null
    invoice_number: string | null
    invoice_date: string | null
    supplier_name_raw: string | null
    suppliers: { name: string | null } | null
  } | null
}

const aed = (v: number) =>
  new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", maximumFractionDigits: 2 }).format(v)

function monthRange() {
  const d = new Date()
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const last = new Date(y, m, 0).getDate()
  const mm = String(m).padStart(2, "0")
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` }
}

const isDate = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)

export default async function UnassignedPartsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const sp = await searchParams
  const def = monthRange()
  const from = isDate(sp.from) ? sp.from : def.from
  const to = isDate(sp.to) ? sp.to : def.to

  const shellUser = await getShellUser()
  const supabase = await createClient()

  const [{ data: itemData }, { data: billData }] = await Promise.all([
    supabase
      .from("supplier_invoice_items")
      .select(
        "id, description, sku, quantity, unit_cost, line_total, inventory_item_id, supplier_invoices!inner(id, doc_number, invoice_number, invoice_date, supplier_name_raw, status, deleted_at, suppliers(name))",
      )
      .is("job_id", null)
      .is("parts_request_id", null)
      .eq("supplier_invoices.status", "confirmed")
      .is("supplier_invoices.deleted_at", null)
      .gte("supplier_invoices.invoice_date", from)
      .lte("supplier_invoices.invoice_date", to)
      .limit(2000),
    supabase
      .from("supplier_invoices")
      .select("subtotal")
      .eq("status", "confirmed")
      .is("deleted_at", null)
      .gte("invoice_date", from)
      .lte("invoice_date", to),
  ])

  const items = (itemData ?? []) as unknown as ItemRow[]
  const stockIds = [...new Set(items.map((i) => i.inventory_item_id).filter((v): v is string => !!v))]
  const { data: stockData } = stockIds.length
    ? await supabase.from("inventory_items").select("id, name, quantity").in("id", stockIds)
    : { data: [] as { id: string; name: string | null; quantity: number | null }[] }
  const stock = new Map((stockData ?? []).map((s) => [s.id as string, s]))

  const rows = items
    .map((i) => {
      const cost = Number(i.line_total) || (Number(i.quantity) || 0) * (Number(i.unit_cost) || 0)
      return { ...i, cost, inStock: !!i.inventory_item_id }
    })
    .sort((a, b) => b.cost - a.cost)

  const total = rows.reduce((s, r) => s + r.cost, 0)
  const lost = rows.filter((r) => !r.inStock).reduce((s, r) => s + r.cost, 0)
  const shelf = total - lost
  const purchases = (billData ?? []).reduce((s, b) => s + (Number(b.subtotal) || 0), 0)
  const share = purchases ? Math.round((total / purchases) * 1000) / 10 : 0

  return (
    <AppShell user={shellUser}>
      <main className="mx-auto flex max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-balance text-xl font-semibold">Parts not on a car</h1>
            <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
              Parts on confirmed supplier bills that aren&apos;t linked to any job. Every bill already counts as a
              purchase in your profit, so these parts lower profit unless they&apos;re billed to a customer.
            </p>
          </div>
          <form className="flex flex-wrap items-end gap-2" method="get">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              From
              <input
                type="date"
                name="from"
                defaultValue={from}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              To
              <input
                type="date"
                name="to"
                defaultValue={to}
                className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Show
            </button>
          </form>
        </header>

        <section aria-label="Profit impact" className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
            <span className="text-xs text-muted-foreground">Total not on a car</span>
            <span className="text-2xl font-semibold tabular-nums">{aed(total)}</span>
            <span className="text-xs text-muted-foreground">
              {share}% of {aed(purchases)} purchases in this period
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-card p-4">
            <span className="text-xs text-muted-foreground">Hurting profit</span>
            <span className="text-2xl font-semibold tabular-nums text-destructive">{aed(lost)}</span>
            <span className="text-xs text-muted-foreground">Not on a car and not in stock. This is lost cost.</span>
          </div>
          <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
            <span className="text-xs text-muted-foreground">Sitting in stock</span>
            <span className="text-2xl font-semibold tabular-nums">{aed(shelf)}</span>
            <span className="text-xs text-muted-foreground">
              Counted as cost now. You get it back when it&apos;s used on a job.
            </span>
          </div>
        </section>

        {rows.length === 0 ? (
          <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            Every part bought in this period is linked to a car.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <caption className="sr-only">Supplier bill lines not linked to a job</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Part</th>
                  <th scope="col" className="px-4 py-3 font-medium">Supplier bill</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Qty</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Cost</th>
                  <th scope="col" className="px-4 py-3 font-medium">Profit effect</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const bill = r.supplier_invoices
                  const item = r.inventory_item_id ? stock.get(r.inventory_item_id) : undefined
                  return (
                    <tr key={r.id} className="border-b border-border align-top last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium">{r.description || item?.name || "Unnamed part"}</div>
                        {r.sku ? <div className="font-mono text-xs text-muted-foreground">{r.sku}</div> : null}
                      </td>
                      <td className="px-4 py-3">
                        <div>{bill?.suppliers?.name || bill?.supplier_name_raw || "Unknown supplier"}</div>
                        <div className="text-xs text-muted-foreground">
                          {[bill?.invoice_number || bill?.doc_number, bill?.invoice_date].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{Number(r.quantity) || 0}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{aed(r.cost)}</td>
                      <td className="px-4 py-3">
                        {r.inStock ? (
                          <span className="flex flex-col">
                            <span>In stock</span>
                            <span className="text-xs text-muted-foreground">
                              {item ? `${Number(item.quantity) || 0} on shelf now` : "Stock item"}
                            </span>
                          </span>
                        ) : (
                          <span className="flex flex-col">
                            <span className="text-destructive">Lowers profit</span>
                            <span className="text-xs text-muted-foreground">No car, not in stock</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
              {rows.length} {rows.length === 1 ? "line" : "lines"}. To fix a line, link it to its job from{" "}
              <Link href="/purchasing" className="underline underline-offset-2">
                Purchasing
              </Link>
              .
            </p>
          </div>
        )}
      </main>
    </AppShell>
  )
}
